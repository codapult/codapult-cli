import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../../utils/project.js';
import { getProjectEnvOptions, loadProjectEnv } from '../../utils/project-env.js';
import { getAdapters } from '../../utils/env-config.js';
import { envSourceSchema } from './schemas.js';
import { commandResponse, runProjectCommand } from '../../utils/command.js';
import { previewMigration } from '../../utils/db-diff.js';
import { parseDatabaseSchema } from '../../utils/schema-parser.js';
import { compareSchemaFiles } from '../../utils/schema-parity.js';
import { diffSchemaWithLiveDatabase, inspectLiveDatabase } from '../../utils/live-db-diff.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

function getDatabaseContext(
  root: string,
  envSource?: 'file' | 'process',
): {
  provider: 'turso' | 'postgres';
  schemaPath: string;
} {
  const envContent = loadProjectEnv(root, getProjectEnvOptions(envSource)).content;
  const provider = getAdapters(envContent).database;
  return {
    provider,
    schemaPath: provider === 'postgres' ? 'src/lib/db/schema-pg.ts' : 'src/lib/db/schema.ts',
  };
}

const parseSchema = parseDatabaseSchema;

export function registerDbTools(server: McpServer): void {
  server.registerTool(
    'codapult_db_generate',
    {
      title: 'Generate Database Migration',
      description: 'Generate a database migration from the current Drizzle schema',
      inputSchema: {
        dry_run: z.boolean().default(false).describe('Preview without changing files'),
      },
    },
    ({ dry_run }) => {
      const root = getRoot();
      const { provider } = getDatabaseContext(root);
      if (dry_run) {
        const preview = previewMigration(root, provider, getDatabaseContext(root).schemaPath);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(preview, null, 2) }],
          isError: !preview.command.passed,
        };
      }
      return commandResponse(
        runProjectCommand('pnpm db:generate', root, {
          env: provider === 'postgres' ? { DB_PROVIDER: 'postgres' } : undefined,
        }),
      );
    },
  );

  server.registerTool(
    'codapult_db_migration_diff',
    {
      title: 'Preview Database Migration',
      description:
        'Generate the pending SQL migration in a temporary directory without changing project files. Compares source schema with local migration history, not the live database.',
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const { provider, schemaPath } = getDatabaseContext(root);
      const preview = previewMigration(root, provider, schemaPath);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(preview, null, 2) }],
        isError: !preview.command.passed,
      };
    },
  );

  server.registerTool(
    'codapult_db_push',
    {
      title: 'Push Database Schema',
      description: 'Apply the current Drizzle schema to the configured database',
      inputSchema: {
        dry_run: z.boolean().default(false).describe('Preview without changing the database'),
      },
    },
    ({ dry_run }) => {
      const root = getRoot();
      const { provider } = getDatabaseContext(root);
      if (dry_run) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ dryRun: true, command: 'pnpm db:push', provider }, null, 2),
            },
          ],
        };
      }
      return commandResponse(
        runProjectCommand('pnpm db:push', root, {
          env: provider === 'postgres' ? { DB_PROVIDER: 'postgres' } : undefined,
        }),
      );
    },
  );

  server.registerTool(
    'codapult_db_seed',
    {
      title: 'Seed Database',
      description: 'Run the project database seed script',
      inputSchema: {
        dry_run: z.boolean().default(false).describe('Preview without changing the database'),
      },
    },
    ({ dry_run }) => {
      if (dry_run) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ dryRun: true, command: 'pnpm db:seed' }, null, 2),
            },
          ],
        };
      }
      return commandResponse(runProjectCommand('pnpm db:seed', getRoot()));
    },
  );

  server.registerTool(
    'codapult_db_get_tables',
    {
      title: 'Get Database Tables',
      description: 'List all tables in the database schema with column counts',
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const { provider, schemaPath } = getDatabaseContext(root);
      const content = readProjectFile(root, schemaPath);
      if (!content)
        return {
          content: [{ type: 'text' as const, text: 'Schema file not found' }],
          isError: true,
        };

      const tables = parseSchema(content);
      const summary = tables.map((t) => ({
        name: t.name,
        columns: t.columns.length,
        columnNames: t.columns.map((c) => c.name),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ provider, schemaPath, tables: summary }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codapult_db_get_table_info',
    {
      title: 'Get Table Info',
      description:
        'Get detailed column info for a specific database table (columns, types, constraints)',
      inputSchema: {
        table: z.string().describe('Table name (e.g. "user", "subscription")'),
      },
    },
    ({ table }) => {
      const root = getRoot();
      const { provider, schemaPath } = getDatabaseContext(root);
      const content = readProjectFile(root, schemaPath);
      if (!content)
        return {
          content: [{ type: 'text' as const, text: 'Schema file not found' }],
          isError: true,
        };

      const tables = parseSchema(content);
      const found = tables.find((t) => t.name === table);
      if (!found) {
        const available = tables.map((t) => t.name).join(', ');
        return {
          content: [
            { type: 'text' as const, text: `Table "${table}" not found. Available: ${available}` },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ provider, schemaPath, ...found }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codapult_db_status',
    {
      title: 'Database Status',
      description: 'Get database provider, table count, and migration count',
      inputSchema: {
        env_source: envSourceSchema.optional(),
      },
    },
    ({ env_source }) => {
      const root = getRoot();

      const envContent = loadProjectEnv(root, getProjectEnvOptions(env_source)).content;
      const provider = getAdapters(envContent).database;
      const schemaPath =
        provider === 'postgres' ? 'src/lib/db/schema-pg.ts' : 'src/lib/db/schema.ts';

      const schemaContent = readProjectFile(root, schemaPath) ?? '';
      const tables = parseSchema(schemaContent);

      let sqliteMigrations = 0;
      let pgMigrations = 0;
      const migrDir = resolve(root, 'src/lib/db/migrations');
      const migrPgDir = resolve(root, 'src/lib/db/migrations-pg');
      if (existsSync(migrDir)) {
        sqliteMigrations = readdirSync(migrDir).filter((f) => f.endsWith('.sql')).length;
      }
      if (existsSync(migrPgDir)) {
        pgMigrations = readdirSync(migrPgDir).filter((f) => f.endsWith('.sql')).length;
      }

      const result = {
        provider,
        schemaPath,
        migrationsPath:
          provider === 'postgres' ? 'src/lib/db/migrations-pg' : 'src/lib/db/migrations',
        tableCount: tables.length,
        sqliteMigrations,
        pgMigrations,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_db_live_diff',
    {
      title: 'Compare Schema With Live Database',
      description:
        'Read-only comparison of the active Drizzle schema with the configured live database. Runs only catalog queries; never executes DDL or migration commands.',
      inputSchema: {
        env_source: envSourceSchema.optional(),
      },
    },
    ({ env_source }) => {
      const root = getRoot();
      const { provider, schemaPath } = getDatabaseContext(root, env_source);
      const schema = parseSchema(readProjectFile(root, schemaPath) ?? '');
      try {
        const envContent = loadProjectEnv(root, getProjectEnvOptions(env_source)).content;
        const database = inspectLiveDatabase(root, envContent);
        const differences = diffSchemaWithLiveDatabase(schema, database);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  provider,
                  schemaPath,
                  readOnly: true,
                  identical: differences.length === 0,
                  status: differences.length > 0 ? 'fail' : 'ok',
                  differences,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: error instanceof Error ? error.message : 'Live database inspection failed',
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'codapult_db_schema_diff',
    {
      title: 'Compare Database Schemas',
      description:
        'Compare SQLite and PostgreSQL schema files and report missing tables, columns, and type differences',
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const sqlitePath = 'src/lib/db/schema.ts';
      const postgresPath = 'src/lib/db/schema-pg.ts';
      const report = compareSchemaFiles(
        parseSchema(readProjectFile(root, sqlitePath) ?? ''),
        parseSchema(readProjectFile(root, postgresPath) ?? ''),
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ...report,
                sqlitePath,
                postgresPath,
              },
              null,
              2,
            ),
          },
        ],
        isError: report.status === 'fail',
      };
    },
  );
}
