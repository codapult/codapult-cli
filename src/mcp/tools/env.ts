import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../../utils/project.js';
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  getProjectEnvOptions,
  loadProjectEnv,
} from '../../utils/project-env.js';
import { envSourceSchema } from './schemas.js';

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

    const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(trimmed);
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

const SENSITIVE_PATTERNS = [/SECRET/i, /KEY/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

const ENV_KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;

export function registerEnvTools(server: McpServer): void {
  server.registerTool(
    'codapult_env_schema',
    {
      title: 'Env Schema',
      description: `Get all environment variables from ${ENV_EXAMPLE_FILE_NAME} with descriptions and default values`,
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const content = readProjectFile(root, ENV_EXAMPLE_FILE_NAME);
      if (!content)
        return {
          content: [{ type: 'text' as const, text: `${ENV_EXAMPLE_FILE_NAME} not found` }],
          isError: true,
        };

      const entries = parseEnvFile(content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_env_read',
    {
      title: 'Read Env',
      description: `Read current ${ENV_FILE_NAME} values with validation status against ${ENV_EXAMPLE_FILE_NAME}. Sensitive values (keys containing SECRET, KEY, TOKEN, PASSWORD, CREDENTIAL) are masked by default.`,
      inputSchema: {
        show_secrets: z
          .boolean()
          .default(false)
          .describe('When true, show full values for sensitive keys (use with caution)'),
        env_source: envSourceSchema.optional(),
      },
    },
    ({ show_secrets, env_source }) => {
      const root = getRoot();
      const env = loadProjectEnv(root, getProjectEnvOptions(env_source));
      const localContent = env.content;
      if (!localContent && env.source === 'file')
        return {
          content: [{ type: 'text' as const, text: `${ENV_FILE_NAME} not found` }],
          isError: true,
        };

      const exampleContent = readProjectFile(root, ENV_EXAMPLE_FILE_NAME) ?? '';
      const localEntries = parseEnvFile(localContent);
      const exampleEntries = parseEnvFile(exampleContent);
      const localKeys = new Set(localEntries.map((e) => e.key));

      const missing = exampleEntries
        .filter((e) => e.required && !localKeys.has(e.key))
        .map((e) => e.key);

      const unconfigured = localEntries
        .filter((e) => !e.value || /^(your-|generate-|""?)/.test(e.value))
        .map((e) => e.key);

      const variables = localEntries.map((e) => ({
        key: e.key,
        value: !show_secrets && isSensitiveKey(e.key) ? maskValue(e.value) : e.value,
        comment: e.comment,
        sensitive: isSensitiveKey(e.key) || undefined,
      }));

      const result = {
        variables,
        missing,
        unconfigured,
        ...(show_secrets ? { warning: 'Sensitive values are shown in plain text' } : {}),
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_env_update',
    {
      title: 'Update Env Variable',
      description: `Update or add a single environment variable in ${ENV_FILE_NAME}`,
      inputSchema: {
        key: z.string().describe('Variable name (e.g. "STRIPE_SECRET_KEY")'),
        value: z.string().describe('Variable value'),
        env_source: envSourceSchema.optional(),
      },
    },
    ({ key, value, env_source }) => {
      if (!ENV_KEY_REGEX.test(key)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid key "${key}": must match ${ENV_KEY_REGEX} (uppercase letters, digits, underscores; must start with a letter)`,
            },
          ],
          isError: true,
        };
      }

      const root = getRoot();
      if (env_source === 'process') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Updating process.env via MCP is not supported; use env_source="file"',
            },
          ],
          isError: true,
        };
      }
      const envPath = resolve(root, ENV_FILE_NAME);

      if (!existsSync(envPath)) {
        return {
          content: [{ type: 'text' as const, text: `${ENV_FILE_NAME} not found` }],
          isError: true,
        };
      }

      const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      let content = readFileSync(envPath, 'utf-8');
      const line = `${key}="${escapedValue}"`;

      const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content = content.trimEnd() + `\n${line}\n`;
      }

      writeFileSync(envPath, content, 'utf-8');
      return { content: [{ type: 'text' as const, text: `Updated ${key} in ${ENV_FILE_NAME}` }] };
    },
  );
}
