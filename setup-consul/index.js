/**
 * Copyright (c) narwhl 2026
 * SPDX-License-Identifier: MPL-2.0
 */

const core = require('@actions/core');

const setup = require('./lib/setup-consul');

(async () => {
  try {
    await setup();
  } catch (error) {
    core.setFailed(error.message);
  }
})();
