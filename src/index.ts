#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';
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
  dbLiveDiffCommand,
  dbSchemaDiffCommand,
} from './commands/db.js';
import { envCheckCommand, envSyncCommand } from './commands/env.js';
import { mcpContractCheckCommand, mcpDoctorCommand, mcpUpdateCommand } from './commands/mcp.js';
import {
  guardCheckCommand,
  guardAuditCommand,
  guardInitCommand,
  guardAnalyzeCommand,
  guardProposeCommand,
  guardInstallAgentCommand,
  guardDoctorCommand,
  guardHistoryCommand,
  guardHistoryDiffCommand,
  guardVerifyCommand,
  guardReviewCommand,
  guardRulesApproveCommand,
  guardContractsApproveCommand,
  guardContractsRejectCommand,
  guardBaselineCommand,
} from './commands/guard.js';
import {
  deployVercelCommand,
  deployDockerCommand,
  deployStatusCommand,
} from './commands/deploy.js';
import { ENV_EXAMPLE_FILE_NAME, ENV_FILE_NAME } from './utils/project-env.js';
import { config } from './utils/config.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const program = new Command()
  .name(config.commandName)
  .description(`${config.projectName} CLI — manage your SaaS project`)
  .version(packageJson.version)
  .configureHelp({
    styleTitle: (str) => pc.bold(pc.cyan(str)),
    styleCommandText: (str) => pc.yellow(str),
    styleOptionText: (str) => pc.green(str),
  })
  .hook('postAction', () => undefined);

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
  .description(`update from upstream ${config.projectName} releases`)
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
  .description(`manage ${config.projectName} plugins`);

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
withNoEnvFileOption(
  db.command('live-diff').description('read-only compare schema with the live database'),
).action(dbLiveDiffCommand);
db.command('schema-diff')
  .description('compare SQLite and PostgreSQL schema files')
  .action(dbSchemaDiffCommand);

const env = program.command('env').description('environment variable management');

const guard = program
  .commandsGroup('Architecture')
  .command('guard')
  .description('protect project architecture from new violations');

guard
  .command('init')
  .description('create local Guard rules and baseline')
  .option('--force', 'replace an existing Guard baseline and generated memory')
  .action(guardInitCommand);
guard
  .command('analyze')
  .description('analyze project structure, dependencies, AST, and conventions')
  .action(guardAnalyzeCommand);
guard
  .command('propose')
  .description('generate evidence-based rule and contract proposals for an AI agent')
  .option('--json', 'print a machine-readable proposal packet')
  .action(guardProposeCommand);
guard
  .command('install-agent [target]')
  .description('install or update the Guard instruction block for an AI agent')
  .option('--json', 'emit machine-readable JSON')
  .action(guardInstallAgentCommand);
guard
  .command('doctor')
  .description('diagnose Guard artifacts and configuration')
  .option('--json', 'print a machine-readable report')
  .action(guardDoctorCommand);
guard
  .command('history')
  .description('list persisted Guard project snapshots')
  .action(guardHistoryCommand);
guard
  .command('history-diff <from> <to>')
  .description('compare two Guard project snapshots')
  .option('--json', 'print a machine-readable report')
  .action(guardHistoryDiffCommand);
guard
  .command('check')
  .description('check architecture rules against the project')
  .option('--changed', 'check only files changed from HEAD')
  .option('--json', 'print a machine-readable report')
  .option('--sarif', 'print a SARIF report for CI code-scanning integrations')
  .action(guardCheckCommand);
guard
  .command('audit')
  .description('run a full Guard audit, including baseline findings')
  .option('--json', 'print a machine-readable report')
  .action(guardAuditCommand);
guard
  .command('verify')
  .description('verify checks, build, and architecture regressions')
  .option('--checks <list>', 'comma-separated: lint,typecheck,test,build')
  .option('--tools <mode>', 'external tools: auto, on, or off', 'auto')
  .option('--strict', 'fail when an explicitly requested check or adapter is not configured')
  .option('--no-project-checks', 'skip project lint/typecheck/test/build checks')
  .option('--requirement <file>', 'read acceptance criteria from a UTF-8 text file')
  .option('--changed', 'check architecture only in changed and untracked files')
  .option('--json', 'print a machine-readable report')
  .action(guardVerifyCommand);
guard
  .command('review')
  .description('prepare a semantic review packet for an AI agent')
  .option('--max-diff-chars <number>', 'limit diff size in the packet', '120000')
  .option('--base <ref>', 'review the PR diff from a base ref, for example origin/main')
  .option('--requirement <file>', 'read acceptance criteria from a UTF-8 text file')
  .action(guardReviewCommand);
const guardRules = guard.command('rules').description('manage discovered Guard rules');
guardRules
  .command('approve [ids]')
  .description('activate proposed rules by comma-separated ID')
  .option('--all', 'activate all proposed rules')
  .action(guardRulesApproveCommand);
const guardContracts = guard.command('contracts').description('manage project Guard contracts');
guardContracts
  .command('approve [ids]')
  .description('activate proposed contracts by comma-separated ID')
  .option('--all', 'activate all proposed contracts')
  .action(guardContractsApproveCommand);
guardContracts
  .command('reject [ids]')
  .description('reject proposed contracts by comma-separated ID')
  .option('--all', 'reject all proposed contracts')
  .action(guardContractsRejectCommand);
const guardBaseline = guard.command('baseline').description('manage suppressed Guard findings');
guardBaseline
  .command('list')
  .description('list baseline fingerprints')
  .option('--json', 'print a machine-readable report')
  .action((options: { json?: boolean }) => guardBaselineCommand('list', undefined, options));
guardBaseline
  .command('accept [ids]')
  .description('accept findings into the baseline by fingerprint')
  .option('--all', 'accept all current findings')
  .option('--reason <text>', 'record why the findings are accepted')
  .option('--json', 'print a machine-readable report')
  .action((ids: string | undefined, options: { all?: boolean; reason?: string; json?: boolean }) =>
    guardBaselineCommand('accept', ids, options),
  );
guardBaseline
  .command('remove [ids]')
  .description('remove fingerprints from the baseline')
  .option('--all', 'remove all current findings')
  .option('--reason <text>', 'record why the findings are removed')
  .option('--json', 'print a machine-readable report')
  .action((ids: string | undefined, options: { all?: boolean; reason?: string; json?: boolean }) =>
    guardBaselineCommand('remove', ids, options),
  );

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

const mcp = program
  .commandsGroup('AI Integration')
  .command('mcp')
  .description('manage the project MCP configuration');

mcp
  .command('update [version]')
  .description(
    `pin the ${config.projectName} MCP server to a version (defaults to the latest npm version)`,
  )
  .option('--dry-run', 'show the update without writing .cursor/mcp.json')
  .action(mcpUpdateCommand);

mcp
  .command('doctor')
  .description('check project health for MCP-assisted work')
  .action(mcpDoctorCommand);

mcp
  .command('contract-check')
  .description('verify env-schema.ts matches the CLI MCP compatibility contract')
  .action(mcpContractCheckCommand);

program
  .command('mcp-server')
  .description('start MCP server for AI assistant integration (Cursor, Claude, Codex)')
  .action(async () => {
    await import('./mcp/server.js');
  });

program.parse();
