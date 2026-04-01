import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../utils/project.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a LaunchKit project');
  return root;
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    'launchkit_schema',
    'launchkit://schema',
    { title: 'Database Schema', description: 'Drizzle ORM schema (src/lib/db/schema.ts) — all tables, columns, types, and relations', mimeType: 'text/plain' },
    async () => {
      const content = readProjectFile(getRoot(), 'src/lib/db/schema.ts') ?? 'Schema file not found';
      return { contents: [{ uri: 'launchkit://schema', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'launchkit_app_config',
    'launchkit://config/app',
    { title: 'App Configuration', description: 'Application config (src/config/app.ts) — brand, features, AI, auth settings', mimeType: 'text/plain' },
    async () => {
      const content = readProjectFile(getRoot(), 'src/config/app.ts') ?? 'Config file not found';
      return { contents: [{ uri: 'launchkit://config/app', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'launchkit_agents_md',
    'launchkit://agents',
    { title: 'AGENTS.md', description: 'AI agent guide — project structure, patterns, conventions, and rules', mimeType: 'text/markdown' },
    async () => {
      const content = readProjectFile(getRoot(), 'AGENTS.md') ?? 'AGENTS.md not found';
      return { contents: [{ uri: 'launchkit://agents', text: content, mimeType: 'text/markdown' }] };
    },
  );

  server.registerResource(
    'launchkit_env_example',
    'launchkit://env-example',
    { title: '.env.example', description: 'Environment variable template with descriptions and defaults', mimeType: 'text/plain' },
    async () => {
      const content = readProjectFile(getRoot(), '.env.example') ?? '.env.example not found';
      return { contents: [{ uri: 'launchkit://env-example', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'launchkit_validation',
    'launchkit://validation',
    { title: 'Zod Schemas', description: 'All Zod validation schemas (src/lib/validation.ts)', mimeType: 'text/plain' },
    async () => {
      const content = readProjectFile(getRoot(), 'src/lib/validation.ts') ?? 'validation.ts not found';
      return { contents: [{ uri: 'launchkit://validation', text: content, mimeType: 'text/plain' }] };
    },
  );

  server.registerResource(
    'launchkit_navigation',
    'launchkit://config/navigation',
    { title: 'Navigation Config', description: 'Dashboard & admin sidebar items (src/config/navigation.ts)', mimeType: 'text/plain' },
    async () => {
      const content = readProjectFile(getRoot(), 'src/config/navigation.ts') ?? 'navigation.ts not found';
      return { contents: [{ uri: 'launchkit://config/navigation', text: content, mimeType: 'text/plain' }] };
    },
  );
}
