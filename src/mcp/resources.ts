import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../utils/project.js';
import { ENV_EXAMPLE_FILE_NAME, loadProjectEnv } from '../utils/project-env.js';
import { getAdapters } from '../utils/env-config.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

function getSchemaPath(root: string): string {
  const provider = getAdapters(loadProjectEnv(root).content).database;
  return provider === 'postgres' ? 'src/lib/db/schema-pg.ts' : 'src/lib/db/schema.ts';
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    'codapult_schema',
    'codapult://schema',
    {
      title: 'Database Schema',
      description:
        'Active Drizzle ORM schema selected by DB_PROVIDER — all tables, columns, types, and relations',
      mimeType: 'text/plain',
    },
    () => {
      const root = getRoot();
      const content = readProjectFile(root, getSchemaPath(root)) ?? 'Schema file not found';
      return { contents: [{ uri: 'codapult://schema', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'codapult_app_config',
    'codapult://config/app',
    {
      title: 'App Configuration',
      description: `Application config (src/config/app.ts) — brand and company. AI runtime settings, feature toggles, and auth methods live in src/config/env.ts — see codapult://config/env.`,
      mimeType: 'text/plain',
    },
    () => {
      const content = readProjectFile(getRoot(), 'src/config/app.ts') ?? 'Config file not found';
      return {
        contents: [{ uri: 'codapult://config/app', text: content, mimeType: 'text/plain' }],
      };
    },
  );

  server.registerResource(
    'codapult_env_config',
    'codapult://config/env',
    {
      title: 'Environment Configuration',
      description: `Typed env access (src/config/env.ts) — feature toggles (env.features), auth methods (env.auth), provider selection (db.provider, payments.provider, storage.provider, jobs.provider), and checkout resolution. This is the source of truth for which modules are enabled — see also codapult://env-example or codapult_project_status.`,
      mimeType: 'text/plain',
    },
    () => {
      const content = readProjectFile(getRoot(), 'src/config/env.ts') ?? 'Config file not found';
      return {
        contents: [{ uri: 'codapult://config/env', text: content, mimeType: 'text/plain' }],
      };
    },
  );

  server.registerResource(
    'codapult_agents_md',
    'codapult://agents',
    {
      title: 'AGENTS.md',
      description: 'AI agent guide — project structure, patterns, conventions, and rules',
      mimeType: 'text/markdown',
    },
    () => {
      const content = readProjectFile(getRoot(), 'AGENTS.md') ?? 'AGENTS.md not found';
      return { contents: [{ uri: 'codapult://agents', text: content, mimeType: 'text/markdown' }] };
    },
  );

  server.registerResource(
    'codapult_env_example',
    'codapult://env-example',
    {
      title: ENV_EXAMPLE_FILE_NAME,
      description: 'Environment variable template with descriptions and defaults',
      mimeType: 'text/plain',
    },
    () => {
      const content =
        readProjectFile(getRoot(), ENV_EXAMPLE_FILE_NAME) ?? `${ENV_EXAMPLE_FILE_NAME} not found`;
      return {
        contents: [{ uri: 'codapult://env-example', text: content, mimeType: 'text/plain' }],
      };
    },
  );

  server.registerResource(
    'codapult_validation',
    'codapult://validation',
    {
      title: 'Zod Schemas',
      description: 'All Zod validation schemas (src/lib/validation.ts)',
      mimeType: 'text/plain',
    },
    () => {
      const content =
        readProjectFile(getRoot(), 'src/lib/validation.ts') ?? 'validation.ts not found';
      return {
        contents: [{ uri: 'codapult://validation', text: content, mimeType: 'text/plain' }],
      };
    },
  );

  server.registerResource(
    'codapult_navigation',
    'codapult://config/navigation',
    {
      title: 'Navigation Config',
      description: 'Dashboard & admin sidebar items (src/config/navigation.ts)',
      mimeType: 'text/plain',
    },
    () => {
      const content =
        readProjectFile(getRoot(), 'src/config/navigation.ts') ?? 'navigation.ts not found';
      return {
        contents: [{ uri: 'codapult://config/navigation', text: content, mimeType: 'text/plain' }],
      };
    },
  );

  server.registerResource(
    'codapult_config_files',
    'codapult://config/files',
    {
      title: 'Configuration Files',
      description:
        'All non-test TypeScript configuration files from src/config, including marketing and navigation configuration',
      mimeType: 'application/json',
    },
    () => {
      const root = getRoot();
      const configDir = resolve(root, 'src/config');
      const files = existsSync(configDir)
        ? readdirSync(configDir)
            .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
            .sort()
        : [];
      const contents = Object.fromEntries(
        files.map((file) => [file, readProjectFile(root, `src/config/${file}`) ?? '']),
      );
      return {
        contents: [
          {
            uri: 'codapult://config/files',
            text: JSON.stringify({ files, contents }, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );
}
