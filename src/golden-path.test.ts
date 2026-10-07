import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { setupCommand } from './commands/setup.js';
import { createMcpServer } from './mcp/server-factory.js';

const originalCwd = process.cwd();

function parseToolText(result: unknown): unknown {
  if (result === null || typeof result !== 'object') {
    throw new Error('MCP tool returned an invalid result');
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error('MCP tool did not return content');

  const first: unknown = content[0];
  if (
    first === null ||
    typeof first !== 'object' ||
    (first as { type?: unknown }).type !== 'text' ||
    typeof (first as { text?: unknown }).text !== 'string'
  ) {
    throw new Error('MCP tool did not return text content');
  }

  return JSON.parse((first as { text: string }).text) as unknown;
}

function createProjectFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'codapult-golden-path-'));
  mkdirSync(join(root, 'src/config'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'codapult', version: '0.1.0' }));
  writeFileSync(join(root, '.env.example'), 'APP_MODE="app"\nNEXT_PUBLIC_APP_NAME="Codapult"\n');
  writeFileSync(
    join(root, 'src/config/app.ts'),
    "export const appConfig = { appName: 'Codapult', appUrl: 'http://localhost:3000' } as const;\n",
  );
  return root;
}

describe('Codapult golden path contract', () => {
  let root: string | undefined;
  let client: Client | undefined;
  let server: ReturnType<typeof createMcpServer> | undefined;

  afterEach(async () => {
    process.chdir(originalCwd);
    await client?.close();
    await server?.close();
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
    client = undefined;
    server = undefined;
  });

  it('runs setup, MCP generation, and Guard verification as one workflow', async () => {
    root = createProjectFixture();
    process.chdir(root);

    await setupCommand({ preset: 'demo', envFile: true });

    const env = readFileSync(join(root, '.env.local'), 'utf8');
    const mcpConfig = JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')) as {
      mcpServers: { codapult: { args: string[] } };
    };
    expect(env).toContain('APP_MODE=demo');
    expect(mcpConfig.mcpServers.codapult.args).toEqual([
      '-y',
      '@codapult/cli@latest',
      'mcp-server',
    ]);

    server = createMcpServer();
    client = new Client({ name: 'codapult-golden-path', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const statusResult = await client.callTool({ name: 'codapult_project_status', arguments: {} });
    expect(parseToolText(statusResult)).toMatchObject({ name: 'codapult' });

    const generateResult = await client.callTool({
      name: 'codapult_generate_page',
      arguments: { name: 'saved-reports' },
    });
    const generated = parseToolText(generateResult) as { created: boolean; path: string };
    const generatedPath = join(
      root,
      'src/app/[locale]/(protected)/(dashboard)/dashboard/saved-reports/page.tsx',
    );
    expect(generated).toMatchObject({ created: true, path: generatedPath });
    expect(existsSync(generatedPath)).toBe(true);

    const guardInitResult = await client.callTool({
      name: 'codapult_guard_init',
      arguments: { root, confirm: true, no_wait: true },
    });
    expect(parseToolText(guardInitResult)).toMatchObject({ status: 'ok', root });

    const proposalResult = await client.callTool({
      name: 'codapult_guard_propose',
      arguments: { root, persist: true, confirm: true },
    });
    expect(parseToolText(proposalResult)).toMatchObject({ status: 'ok', persisted: true });

    const verifyResult = await client.callTool({
      name: 'codapult_guard_verify',
      arguments: { root, project_checks: false, tools: 'off' },
    });
    expect(parseToolText(verifyResult)).toMatchObject({
      status: 'ok',
      outcome: 'pass',
      architecture: { findings: [] },
    });
  });
});
