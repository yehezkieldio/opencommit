#!/usr/bin/env bun

import { cli } from 'cleye';

import packageJSON from '../package.json' with { type: 'json' };
import { commit } from './commands/commit.js';
import { configCommand } from './commands/config.js';
import { checkIsLatestVersion } from './utils/check-is-latest-version.js';

const extraArgs = process.argv.slice(2);

cli(
  {
    version: packageJSON.version,
    name: 'opencommit',
    commands: [configCommand],
    flags: {
      fgm: {
        type: Boolean,
        description: 'Use full GitMoji specification',
        default: false
      },
      context: {
        type: String,
        alias: 'c',
        description: 'Additional user input context for the commit message',
        default: ''
      },
      yes: {
        type: Boolean,
        alias: 'y',
        description: 'Skip commit confirmation prompt',
        default: false
      }
    },
    ignoreArgv: (type) => type === 'unknown-flag' || type === 'argument',
    help: { description: packageJSON.description }
  },
  async ({ flags }) => {
    await checkIsLatestVersion();

    // Removed hooks and migrations logic
    commit(extraArgs, flags.context, false, flags.yes);
  },
  extraArgs
);
