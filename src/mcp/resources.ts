import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../utils/project.js';
import { ENV_EXAMPLE_FILE_NAME, ENV_FILE_NAME } from '../utils/project-env.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    'codapult_schema',
    'codapult://schema',
    {
      title: 'Database Schema',
      description:
        'Drizzle ORM schema (src/lib/db/schema.ts) — all tables, columns, types, and relations',
      mimeType: 'text/plain',
    },
    () => {
      const content = readProjectFile(getRoot(), 'src/lib/db/schema.ts') ?? 'Schema file not found';
      return { contents: [{ uri: 'codapult://schema', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'codapult_app_config',
    'codapult://config/app',
    {
      title: 'App Configuration',
      description: `Application config (src/config/app.ts) — brand, AI, company. Feature toggles and auth methods live in the project env source (${ENV_FILE_NAME} or process.env) and can be inspected via codapult://env-example or codapult_project_status.`,
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
}
