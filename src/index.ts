#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { setupCommand } from './commands/setup.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { configShowCommand } from './commands/config-show.js';
import { pluginsAddCommand, pluginsRemoveCommand, pluginsListCommand } from './commands/plugins.js';
import { generatePageCommand, generateApiCommand, generateActionCommand, generatePluginCommand } from './commands/generate.js';
import { dbPushCommand, dbGenerateCommand, dbSeedCommand, dbStudioCommand, dbStatusCommand } from './commands/db.js';
import { envCheckCommand, envSyncCommand } from './commands/env.js';
import { deployVercelCommand, deployDockerCommand, deployStatusCommand } from './commands/deploy.js';

const program = new Command()
  .name('codapult')
  .description('Codapult CLI — manage your SaaS project')
  .version('0.1.0')
  .configureHelp({
    styleTitle: (str) => pc.bold(pc.cyan(str)),
    styleCommandText: (str) => pc.yellow(str),
    styleOptionText: (str) => pc.green(str),
  });

program
  .commandsGroup('Project')
  .command('setup')
  .description('interactive project setup wizard')
  .action(setupCommand);

program
  .command('update [version]')
  .description('update from upstream Codapult releases')
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
  .commandsGroup('Plugins')
  .command('plugins')
  .description('manage Codapult plugins');

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

const generate = program
  .commandsGroup('Code Generation')
  .command('generate')
  .alias('g')
  .description('scaffold new code from templates');

generate
  .command('page <name>')
  .description('create a dashboard page')
  .action(generatePageCommand);

generate
  .command('api <name>')
  .description('create an API route (auth + rate limit + Zod)')
  .action(generateApiCommand);

generate
  .command('action <name>')
  .description('create a server action')
  .action(generateActionCommand);

generate
  .command('plugin <name>')
  .description('scaffold a new plugin repository')
  .action(generatePluginCommand);

const db = program
  .commandsGroup('Infrastructure')
  .command('db')
  .description('database management (Drizzle ORM)');

db.command('push').description('apply schema to database').action(dbPushCommand);
db.command('generate').description('generate migration files').action(dbGenerateCommand);
db.command('seed').description('seed sample data').action(dbSeedCommand);
db.command('studio').description('open Drizzle Studio').action(dbStudioCommand);
db.command('status').description('show schema info and migration count').action(dbStatusCommand);

const env = program
  .command('env')
  .description('environment variable management');

env.command('check').description('validate .env.local against .env.example').action(envCheckCommand);
env.command('sync').description('add missing variables from .env.example').action(envSyncCommand);

const deploy = program
  .command('deploy')
  .description('deployment helpers');

deploy.command('vercel').description('build and deploy to Vercel').action(deployVercelCommand);
deploy
  .command('docker')
  .description('build Docker image')
  .option('-t, --tag <tag>', 'image tag', 'latest')
  .action(deployDockerCommand);
deploy.command('status').description('check deploy readiness').action(deployStatusCommand);

program
  .commandsGroup('AI Integration')
  .command('mcp-server')
  .description('start MCP server for AI assistant integration (Cursor, Claude, Codex)')
  .action(async () => {
    await import('./mcp/server.js');
  });

program.parse();
