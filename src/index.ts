#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { setupCommand } from './commands/setup.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { configShowCommand } from './commands/config-show.js';
import {
  pluginsAddCommand,
  pluginsRemoveCommand,
  pluginsListCommand,
  pluginsMigrateCommand,
} from './commands/plugins.js';
import {
  generatePageCommand,
  generateApiCommand,
  generateActionCommand,
  generatePluginCommand,
} from './commands/generate.js';
import {
  dbPushCommand,
  dbGenerateCommand,
  dbSeedCommand,
  dbStudioCommand,
  dbStatusCommand,
} from './commands/db.js';
import { envCheckCommand, envSyncCommand } from './commands/env.js';
import {
  deployVercelCommand,
  deployDockerCommand,
  deployStatusCommand,
} from './commands/deploy.js';
import { ENV_EXAMPLE_FILE_NAME, ENV_FILE_NAME } from './utils/project-env.js';

const program = new Command()
  .name('codapult')
  .description('Codapult CLI — manage your SaaS project')
  .version('0.1.0')
  .configureHelp({
    styleTitle: (str) => pc.bold(pc.cyan(str)),
    styleCommandText: (str) => pc.yellow(str),
    styleOptionText: (str) => pc.green(str),
  });

function withNoEnvFileOption(command: Command): Command {
  return command.option(
    '--no-env-file',
    `read env vars from process.env instead of ${ENV_FILE_NAME}`,
  );
}

program
  .commandsGroup('Project')
  .command('setup')
  .description('interactive project setup wizard (or non-interactive with --preset)')
  .option('--preset <value>', 'apply a preset non-interactively (name, key=value pairs, or both)')
  .option('--no-env-file', `do not create ${ENV_FILE_NAME}; read env vars from process.env instead`)
  .action(setupCommand);

program
  .command('update [version]')
  .description('update from upstream Codapult releases')
  .option('--dry-run', 'show what would change without applying')
  .option('--list', 'list available versions')
  .action(updateCommand);

withNoEnvFileOption(
  program.command('doctor').description('check project health and configuration'),
).action(doctorCommand);

withNoEnvFileOption(
  program.command('config').description('show current project configuration'),
).action(configShowCommand);

const plugins = program
  .commandsGroup('Plugins')
  .command('plugins')
  .description('manage Codapult plugins');

withNoEnvFileOption(
  plugins
    .command('add <name>')
    .description('install a plugin (local or remote)')
    .option('--from <url>', 'git URL to clone the plugin from')
    .option(
      '--ci',
      'CI/Vercel mode: skip pnpm install, db:push, env patching, and interactive prompts',
    ),
).action(pluginsAddCommand);

withNoEnvFileOption(
  plugins.command('remove <name>').description('uninstall a plugin').option('--clean'),
).action(pluginsRemoveCommand);

plugins
  .command('migrate [name]')
  .description('update plugin schema and generate DB migration')
  .option('--push', 'use db:push instead of db:generate + db:migrate (dev mode)')
  .action(pluginsMigrateCommand);

plugins.command('list').description('list installed plugins').action(pluginsListCommand);

const generate = program
  .commandsGroup('Code Generation')
  .command('generate')
  .alias('g')
  .description('scaffold new code from templates');

generate.command('page <name>').description('create a dashboard page').action(generatePageCommand);

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

withNoEnvFileOption(db.command('push').description('apply schema to database')).action(
  dbPushCommand,
);
withNoEnvFileOption(db.command('generate').description('generate migration files')).action(
  dbGenerateCommand,
);
withNoEnvFileOption(db.command('seed').description('seed sample data')).action(dbSeedCommand);
withNoEnvFileOption(db.command('studio').description('open Drizzle Studio')).action(
  dbStudioCommand,
);
withNoEnvFileOption(
  db.command('status').description('show schema info and migration count'),
).action(dbStatusCommand);

const env = program.command('env').description('environment variable management');

withNoEnvFileOption(
  env.command('check').description(`validate env vars against ${ENV_EXAMPLE_FILE_NAME}`),
).action(envCheckCommand);
withNoEnvFileOption(
  env.command('sync').description(`add missing variables from ${ENV_EXAMPLE_FILE_NAME}`),
).action(envSyncCommand);

const deploy = program.command('deploy').description('deployment helpers');

withNoEnvFileOption(deploy.command('vercel').description('build and deploy to Vercel')).action(
  deployVercelCommand,
);
withNoEnvFileOption(
  deploy
    .command('docker')
    .description('build Docker image')
    .option('-t, --tag <tag>', 'image tag', 'latest'),
).action(deployDockerCommand);
withNoEnvFileOption(deploy.command('status').description('check deploy readiness')).action(
  deployStatusCommand,
);

program
  .commandsGroup('AI Integration')
  .command('mcp-server')
  .description('start MCP server for AI assistant integration (Cursor, Claude, Codex)')
  .action(async () => {
    await import('./mcp/server.js');
  });

program.parse();
