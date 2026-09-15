/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

const http = require('http');
const https = require('https');

const AUTH_METHODS = new Set(['jwt', 'token']);
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function getBooleanInput (core, name, defaultValue) {
  const value = core.getInput(name, { required: false }).trim().toLowerCase();
  if (value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Input "${name}" must be "true" or "false".`);
}

function normalizeOutputKey (key, upperCase = false) {
  let outputKey = key
    .replaceAll('.', '__')
    .replaceAll('-', '')
    .replace(/[^A-Za-z0-9_]/g, '');

  if (upperCase) outputKey = outputKey.toUpperCase();
  return outputKey;
}

function assertOutputName (name, input) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Output name "${name}" must be a valid environment variable name. Input: "${input}"`);
  }
}

function parseSecretsInput (secretsInput) {
  if (!secretsInput) return [];

  const requests = [];
  const outputNames = new Set();
  const environmentNames = new Set();
  const secrets = secretsInput
    .split(';')
    .map(secret => secret.trim())
    .filter(Boolean);

  for (const secret of secrets) {
    const renameIndex = secret.lastIndexOf('|');
    const key = (renameIndex === -1 ? secret : secret.slice(0, renameIndex)).trim();
    const mappedName = renameIndex === -1 ? '' : secret.slice(renameIndex + 1).trim();

    if (!key) {
      throw new Error(`You must provide a Consul KV key. Input: "${secret}"`);
    }
    if (renameIndex !== -1 && !mappedName) {
      throw new Error(`You must provide a value when mapping a KV key to a name. Input: "${secret}"`);
    }

    const keyWithoutTrailingSlash = key.replace(/\/+$/, '');
    const keyName = keyWithoutTrailingSlash.slice(keyWithoutTrailingSlash.lastIndexOf('/') + 1);
    const outputName = mappedName || normalizeOutputKey(keyName);
    const environmentName = mappedName || normalizeOutputKey(keyName, true);

    assertOutputName(outputName, secret);
    assertOutputName(environmentName, secret);

    if (outputNames.has(outputName) || environmentNames.has(environmentName)) {
      throw new Error(`KV mapping produces a duplicate output or environment variable named "${mappedName || outputName}".`);
    }

    outputNames.add(outputName);
    environmentNames.add(environmentName);
    requests.push({ key, outputName, environmentName });
  }

  return requests;
}

function buildApiUrl (baseUrl, apiPath, query = {}) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Input "url" must be a valid HTTP or HTTPS URL. Received: "${baseUrl}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Input "url" must use HTTP or HTTPS. Received protocol: "${url.protocol}"`);
  }
  if (url.search || url.hash) {
    throw new Error('Input "url" cannot contain a query string or fragment.');
  }

  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${apiPath.replace(/^\/+/, '')}`;
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, value);
  }
  return url;
}

function requestApi (baseUrl, method, apiPath, { body, namespace, token, query } = {}) {
  const url = buildApiUrl(baseUrl, apiPath, query);
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const headers = { Accept: 'application/json' };

  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = payload.length;
  }
  if (token) headers['X-Consul-Token'] = token;
  if (namespace) headers['X-Consul-Namespace'] = namespace;

  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, { method, headers }, response => {
      const chunks = [];
      let size = 0;

      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error(`Consul response exceeded ${MAX_RESPONSE_BYTES} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          body: Buffer.concat(chunks)
        });
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Consul request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function errorDetails (response) {
  const details = response.body.toString('utf8').trim();
  return details ? `: ${details.slice(0, 2000)}` : '';
}

function assertSuccess (response, operation) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${operation} failed with HTTP ${response.statusCode}${errorDetails(response)}`);
  }
}

async function login (core, url, namespace, authMethod, bearerToken) {
  core.info(`Authenticating to Consul with ACL auth method "${authMethod}".`);
  core.setSecret(bearerToken);
  const response = await requestApi(url, 'POST', 'v1/acl/login', {
    namespace,
    body: {
      AuthMethod: authMethod,
      BearerToken: bearerToken
    }
  });
  assertSuccess(response, `Consul login through auth method "${authMethod}"`);

  let tokenResponse;
  try {
    tokenResponse = JSON.parse(response.body.toString('utf8'));
  } catch {
    throw new Error('Consul login returned invalid JSON.');
  }

  const token = tokenResponse.SecretID;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Consul login response did not contain a SecretID.');
  }

  core.setSecret(token);
  core.saveState('consulToken', token);
  core.info(`Authenticated to Consul with ACL auth method "${authMethod}".`);
  return token;
}

async function authenticate (core, url, namespace) {
  const method = (core.getInput('method', { required: false }) || 'token').trim().toLowerCase();
  if (!AUTH_METHODS.has(method)) {
    throw new Error(`Unsupported authentication method "${method}". Supported methods: jwt, token.`);
  }

  const token = core.getInput('token', { required: false });
  const authMethod = core.getInput('authMethod', { required: false });
  const jwt = core.getInput('jwt', { required: false });

  if (method === 'token') {
    if (!token) throw new Error('Input "token" is required when method is token.');
    if (authMethod || jwt) {
      throw new Error('Inputs "authMethod" and "jwt" cannot be used when method is token.');
    }
    core.setSecret(token);
    core.info('Using the supplied Consul ACL token.');
    return token;
  }

  if (token) throw new Error('Input "token" can only be used when method is token.');
  if (!authMethod) throw new Error('Input "authMethod" is required when method is jwt.');
  if (!jwt) throw new Error('Input "jwt" is required when method is jwt.');
  return login(core, url, namespace, authMethod, jwt);
}

function encodeKeyPath (key) {
  const keyWithoutLeadingSlash = key.replace(/^\/+/, '');
  return keyWithoutLeadingSlash
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function retrieveSecret (url, namespace, token, request, ignoreNotFound) {
  const response = await requestApi(url, 'GET', `v1/kv/${encodeKeyPath(request.key)}`, {
    namespace,
    token,
    query: { raw: 'true' }
  });

  if (response.statusCode === 404) {
    if (ignoreNotFound) return null;
    throw new Error(`Consul KV key "${request.key}" was not found.`);
  }

  assertSuccess(response, `Retrieving Consul KV key "${request.key}"`);
  return { request, value: response.body.toString('utf8') };
}

function maskSecret (core, value) {
  for (const line of value.replace(/\r/g, '').split('\n')) {
    if (line) core.setSecret(line);
  }
}

async function run (core) {
  const url = core.getInput('url', { required: true });
  const namespace = core.getInput('namespace', { required: false });
  const requests = parseSecretsInput(core.getInput('secrets', { required: false }));
  const exportEnvironment = getBooleanInput(core, 'exportEnv', true);
  const exportToken = getBooleanInput(core, 'exportToken', false);
  const ignoreNotFound = getBooleanInput(core, 'ignoreNotFound', false);
  if (namespace) core.info(`Using Consul namespace "${namespace}".`);
  const token = await authenticate(core, url, namespace);

  if (requests.length === 0) {
    core.info('No Consul KV values requested.');
  } else {
    core.info(`Retrieving ${requests.length} Consul KV value${requests.length === 1 ? '' : 's'}.`);
  }

  if (exportToken) {
    core.exportVariable('CONSUL_HTTP_ADDR', url);
    core.exportVariable('CONSUL_HTTP_TOKEN', token);
    if (namespace) core.exportVariable('CONSUL_NAMESPACE', namespace);
    core.info(`Exported CONSUL_HTTP_ADDR and CONSUL_HTTP_TOKEN${namespace ? ', plus CONSUL_NAMESPACE' : ''} for subsequent steps.`);
  }

  const results = await Promise.all(
    requests.map(request => retrieveSecret(url, namespace, token, request, ignoreNotFound))
  );

  let retrievedCount = 0;
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (!result) {
      core.warning(`Consul KV key "${requests[index].key}" was not found.`);
      continue;
    }

    maskSecret(core, result.value);
    if (exportEnvironment) {
      core.exportVariable(result.request.environmentName, result.value);
    }
    core.setOutput(result.request.outputName, result.value);
    retrievedCount++;
    core.debug(`Retrieved Consul KV key "${result.request.key}" as "${result.request.outputName}".`);
  }

  if (requests.length > 0) {
    core.info(`Retrieved ${retrievedCount} of ${requests.length} requested Consul KV values.`);
  }
}

async function logout (core) {
  const token = core.getState('consulToken');
  if (!token) return;

  core.setSecret(token);
  const url = core.getInput('url', { required: true });
  const namespace = core.getInput('namespace', { required: false });
  core.info('Revoking the action-created Consul ACL token.');
  const response = await requestApi(url, 'POST', 'v1/acl/logout', { namespace, token });
  assertSuccess(response, 'Consul logout');
  core.info('Revoked the action-created Consul ACL token.');
}

module.exports = {
  logout,
  parseSecretsInput,
  run
};
