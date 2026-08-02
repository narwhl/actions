/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

// Node.js core
const os = require('os');

// External
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const semver = require('semver');
const { Release } = require('@hashicorp/js-releases');

const PRODUCT = 'consul';
const INDEX_URL = `https://releases.hashicorp.com/${PRODUCT}/index.json`;

// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [amd64, 386, arm]
function mapArch (arch) {
  const mappings = {
    x32: '386',
    x64: 'amd64'
  };
  return mappings[arch] || arch;
}

// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS (os) {
  const mappings = {
    win32: 'windows'
  };
  return mappings[os] || os;
}

async function downloadCLI (url) {
  core.debug(`Downloading Consul CLI from ${url}`);
  const pathToCLIZip = await tc.downloadTool(url);

  let pathToCLI = '';

  core.debug('Extracting Consul CLI zip file');
  if (os.platform().startsWith('win')) {
    core.debug(`Consul CLI Download Path is ${pathToCLIZip}`);
    const fixedPathToCLIZip = `${pathToCLIZip}.zip`;
    io.mv(pathToCLIZip, fixedPathToCLIZip);
    core.debug(`Moved download to ${fixedPathToCLIZip}`);
    pathToCLI = await tc.extractZip(fixedPathToCLIZip);
  } else {
    pathToCLI = await tc.extractZip(pathToCLIZip);
  }

  core.debug(`Consul CLI path is ${pathToCLI}.`);

  if (!pathToCLIZip || !pathToCLI) {
    throw new Error(`Unable to download Consul from ${url}`);
  }

  return pathToCLI;
}

// Resolve a release from the HashiCorp releases index.
//
// Only the open-source build is considered. The Consul index also lists
// enterprise (`+ent`) and FIPS (`+ent.fips*`) variants, which are
// license-gated; @hashicorp/js-releases does not exclude them, so a plain
// version or constraint could otherwise resolve to an enterprise binary.
// Prereleases are skipped for `latest`, matching js-releases' own rule.
async function resolveRelease (version) {
  core.debug(`Fetching ${PRODUCT} release index`);
  const response = await fetch(INDEX_URL);
  if (!response.ok) {
    throw new Error(`Unable to fetch ${PRODUCT} release index: ${response.status} ${response.statusText}`);
  }
  const index = await response.json();

  // Open-source versions only: valid semver with no build metadata.
  const versions = Object.keys(index.versions)
    .filter((key) => semver.valid(key) !== null && !key.includes('+'));

  let selected;
  if (version === 'latest' || semver.validRange(version) === null) {
    selected = versions
      .filter((v) => !semver.prerelease(v))
      .sort((a, b) => semver.rcompare(a, b))[0];
  } else {
    selected = semver.maxSatisfying(versions, version);
  }

  if (!selected) {
    throw new Error(`No matching open-source ${PRODUCT} version for "${version}"`);
  }

  return new Release(index.versions[selected]);
}

async function run () {
  try {
    // Gather GitHub Actions inputs
    const version = core.getInput('consul_version') || 'latest';

    // Gather OS details
    const osPlatform = os.platform();
    const osArch = os.arch();

    core.debug(`Finding releases for Consul version ${version}`);
    const release = await resolveRelease(version);
    const platform = mapOS(osPlatform);
    const arch = mapArch(osArch);

    core.debug(`Getting build for Consul version ${release.version}: ${platform} ${arch}`);
    const build = release.getBuild(platform, arch);
    if (!build) {
      throw new Error(`Consul version ${release.version} not available for ${platform} and ${arch}`);
    }

    // Download requested version
    const pathToCLI = await downloadCLI(build.url);

    // Add to path
    core.addPath(pathToCLI);

    return release;
  } catch (error) {
    core.error(error);
    throw error;
  }
}

module.exports = run;
