#!/usr/bin/env node

import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { configShowCommand } from './commands/config-show.js';
import { pluginsAddCommand, pluginsRemoveCommand, pluginsListCommand } from './commands/plugins.js';

const program = new Command()
  .name('launchkit')
  .description('LaunchKit CLI — manage your SaaS project')
  .version('0.1.0');

program
  .command('setup')
  .description('interactive project setup wizard')
  .action(setupCommand);

program
  .command('update [version]')
  .description('update from upstream LaunchKit releases')
  .option('--dry-run', 'show what would change without applying')
  .option('--list', 'list available versions')
  .action(updateCommand);

program
  .command('doctor')
  .description('check project health and configuration')
  .action(doctorCommand);

program
  .command('config')
  .description('show current project configuration')
  .action(configShowCommand);

const plugins = program
  .command('plugins')
  .description('manage LaunchKit plugins');

plugins
  .command('add <name>')
  .description('install a plugin from a local directory')
  .action(pluginsAddCommand);

plugins
  .command('remove <name>')
  .description('uninstall a plugin')
  .action(pluginsRemoveCommand);

plugins
  .command('list')
  .description('list installed plugins')
  .action(pluginsListCommand);

program.parse();
