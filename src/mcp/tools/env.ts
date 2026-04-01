import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../../utils/project.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
  required: boolean;
}

function parseEnvFile(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  let lastComment = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') && !trimmed.startsWith('# ---') && !trimmed.startsWith('# ===')) {
      lastComment = trimmed.slice(1).trim();
      continue;
    }

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (match) {
      entries.push({
        key: match[1],
        value: match[2],
        comment: lastComment || undefined,
        required: !line.startsWith('#'),
      });
      lastComment = '';
    } else {
      lastComment = '';
    }
  }

  return entries;
}

export function registerEnvTools(server: McpServer): void {
  server.registerTool(
    'codapult_env_schema',
    {
      title: 'Env Schema',
      description: 'Get all environment variables from .env.example with descriptions and default values',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const content = readProjectFile(root, '.env.example');
      if (!content) return { content: [{ type: 'text' as const, text: '.env.example not found' }], isError: true };

      const entries = parseEnvFile(content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_env_read',
    {
      title: 'Read Env',
      description: 'Read current .env.local values with validation status against .env.example',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const localContent = readProjectFile(root, '.env.local');
      if (!localContent) return { content: [{ type: 'text' as const, text: '.env.local not found' }], isError: true };

      const exampleContent = readProjectFile(root, '.env.example') ?? '';
      const localEntries = parseEnvFile(localContent);
      const exampleEntries = parseEnvFile(exampleContent);
      const localKeys = new Set(localEntries.map(e => e.key));

      const missing = exampleEntries
        .filter(e => e.required && !localKeys.has(e.key))
        .map(e => e.key);

      const unconfigured = localEntries
        .filter(e => !e.value || /^(your-|generate-|""?)/.test(e.value))
        .map(e => e.key);

      const result = {
        variables: localEntries.map(e => ({ key: e.key, value: e.value, comment: e.comment })),
        missing,
        unconfigured,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_env_update',
    {
      title: 'Update Env Variable',
      description: 'Update or add a single environment variable in .env.local',
      inputSchema: {
        key: z.string().describe('Variable name (e.g. "STRIPE_SECRET_KEY")'),
        value: z.string().describe('Variable value'),
      },
    },
    async ({ key, value }) => {
      const root = getRoot();
      const envPath = resolve(root, '.env.local');

      if (!existsSync(envPath)) {
        return { content: [{ type: 'text' as const, text: '.env.local not found' }], isError: true };
      }

      let content = readFileSync(envPath, 'utf-8');
      const regex = new RegExp(`^${key}\\s*=.*$`, 'm');

      if (regex.test(content)) {
        content = content.replace(regex, `${key}="${value}"`);
      } else {
        content = content.trimEnd() + `\n${key}="${value}"\n`;
      }

      writeFileSync(envPath, content, 'utf-8');
      return { content: [{ type: 'text' as const, text: `Updated ${key} in .env.local` }] };
    },
  );
}
