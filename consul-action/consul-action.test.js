/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { logout, run } = require('./lib/consul-action');

function createCore (inputs) {
  const calls = {
    debug: [],
    info: [],
    exports: new Map(),
    outputs: new Map(),
    secrets: [],
    states: new Map(),
    warnings: []
  };

  return {
    calls,
    debug: message => calls.debug.push(message),
    exportVariable: (name, value) => calls.exports.set(name, value),
    info: message => calls.info.push(message),
    getInput: (name, options = {}) => {
      const value = inputs[name] || '';
      if (options.required && !value) throw new Error(`Input required: ${name}`);
      return value;
    },
    getState: name => calls.states.get(name) || '',
    saveState: (name, value) => calls.states.set(name, value),
    setOutput: (name, value) => calls.outputs.set(name, value),
    setSecret: value => calls.secrets.push(value),
    warning: message => calls.warnings.push(message)
  };
}

async function readRequestBody (request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function withServer (handler, callback) {
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(error => {
      response.statusCode = 500;
      response.end(error.stack);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('token authentication retrieves mapped and default KV values', async () => {
  const requests = [];

  await withServer(async (request, response) => {
    requests.push({
      method: request.method,
      token: request.headers['x-consul-token'],
      url: request.url
    });

    response.setHeader('Content-Type', 'text/plain');
    if (request.url === '/consul/v1/kv/apps/api/password?raw=true') {
      response.end('first-line\nsecond-line');
    } else if (request.url === '/consul/v1/kv/apps/api/npm-token?raw=true') {
      response.end('npm-secret');
    } else {
      response.statusCode = 404;
      response.end();
    }
  }, async url => {
    const core = createCore({
      url: `${url}/consul`,
      token: 'static-token',
      secrets: 'apps/api/password | DB_PASSWORD; apps/api/npm-token; missing | OPTIONAL',
      exportEnv: 'true',
      exportToken: 'true',
      ignoreNotFound: 'true'
    });

    await run(core);

    assert.deepEqual(requests, [
      { method: 'GET', token: 'static-token', url: '/consul/v1/kv/apps/api/password?raw=true' },
      { method: 'GET', token: 'static-token', url: '/consul/v1/kv/apps/api/npm-token?raw=true' },
      { method: 'GET', token: 'static-token', url: '/consul/v1/kv/missing?raw=true' }
    ]);
    assert.equal(core.calls.outputs.get('DB_PASSWORD'), 'first-line\nsecond-line');
    assert.equal(core.calls.outputs.get('npmtoken'), 'npm-secret');
    assert.equal(core.calls.outputs.has('OPTIONAL'), false);
    assert.equal(core.calls.exports.get('DB_PASSWORD'), 'first-line\nsecond-line');
    assert.equal(core.calls.exports.get('NPMTOKEN'), 'npm-secret');
    assert.equal(core.calls.exports.get('CONSUL_HTTP_ADDR'), `${url}/consul`);
    assert.equal(core.calls.exports.get('CONSUL_HTTP_TOKEN'), 'static-token');
    assert.deepEqual(core.calls.warnings, ['Consul KV key "missing" was not found.']);
    assert.deepEqual(core.calls.secrets, ['static-token', 'first-line', 'second-line', 'npm-secret']);
    assert.equal(core.calls.states.size, 0);
  });
});

test('jwt authentication exchanges the supplied JWT and logs out', async () => {
  const requests = [];

  await withServer(async (request, response) => {
    requests.push({
      body: await readRequestBody(request),
      method: request.method,
      token: request.headers['x-consul-token'],
      url: request.url
    });

    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/acl/login') {
      response.end(JSON.stringify({ SecretID: 'jwt-consul-token' }));
    } else if (request.url === '/v1/acl/logout') {
      response.end('true');
    } else {
      response.statusCode = 404;
      response.end();
    }
  }, async url => {
    const core = createCore({
      url,
      method: 'jwt',
      authMethod: 'ci-jwt',
      jwt: 'supplied-jwt'
    });

    await run(core);
    await logout(core);

    assert.deepEqual(JSON.parse(requests[0].body), {
      AuthMethod: 'ci-jwt',
      BearerToken: 'supplied-jwt'
    });
    assert.equal(requests[0].token, undefined);
    assert.deepEqual(requests[1], {
      body: '',
      method: 'POST',
      token: 'jwt-consul-token',
      url: '/v1/acl/logout'
    });
    assert.deepEqual(core.calls.secrets, ['supplied-jwt', 'jwt-consul-token', 'jwt-consul-token']);
    assert.equal(core.calls.states.get('consulToken'), 'jwt-consul-token');
  });
});

test('rejects the removed oidc authentication strategy', async () => {
  const core = createCore({
    url: 'http://127.0.0.1:8500',
    method: 'oidc'
  });

  await assert.rejects(
    run(core),
    /Unsupported authentication method "oidc". Supported methods: jwt, token./
  );
});

