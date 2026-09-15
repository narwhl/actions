/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

const core = require('@actions/core');
const { run } = require('./lib/consul-action');

run(core).catch(error => core.setFailed(error.message));
