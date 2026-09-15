/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

const core = require('@actions/core');
const { logout } = require('./lib/consul-action');

logout(core).catch(error => core.setFailed(error.message));
