import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../dist/mcp/server-factory.js';

const source = mkdtempSync(join(tmpdir(), 'codapult-golden-source-'));
const workspace = mkdtempSync(join(tmpdir(), 'codapult-golden-workspace-'));
const project = join(workspace, 'golden-project');
const createCli = resolve('../codapult-create/dist/index.js');

function run(command, args, cwd, env = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
}

function parseToolText(result) {
  const content = result?.content;
  if (!Array.isArray(content) || content[0]?.type !== 'text') {
    throw new Error('MCP tool returned no text content');
  }
  return JSON.parse(content[0].text);
}

function createSourceFixture() {
  mkdirSync(join(source, 'src/config'), { recursive: true });
  mkdirSync(join(source, 'test'), { recursive: true });
  writeFileSync(
    join(source, 'package.json'),
    `${JSON.stringify(
      {
        name: 'codapult',
        version: '0.1.0',
        scripts: { test: 'node --test' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(source, '.env.example'), 'APP_MODE="app"\nNEXT_PUBLIC_APP_NAME="Codapult"\n');
  writeFileSync(
    join(source, 'src/config/app.ts'),
    "export const appConfig = { appName: 'Codapult', appUrl: 'http://localhost:3000' } as const;\n",
  );
  writeFileSync(
    join(source, 'test/golden-path.test.mjs'),
    "import test from 'node:test';\n\ntest('scaffold test passes', () => {});\n",
  );

  run('git', ['init', '--quiet'], source);
  run('git', ['config', 'user.email', 'golden-path@example.com'], source);
  run('git', ['config', 'user.name', 'Codapult Golden Path'], source);
  run('git', ['add', '.'], source);
  run('git', ['commit', '--quiet', '-m', 'golden fixture'], source);
}

async function main() {
  createSourceFixture();
  run(process.execPath, [createCli, 'golden-project'], workspace, {
    CODAPULT_CREATE_REPOSITORY_URL: source,
    CODAPULT_CREATE_SETUP_COMMAND: `${process.execPath} ${resolve('../codapult-cli/dist/index.js')} setup --preset demo`,
    CODAPULT_CREATE_SKIP_INSTALL: 'true',
  });
  process.chdir(project);
  if (!readFileSync(join(project, '.env.local'), 'utf8').includes('APP_MODE=demo')) {
    throw new Error('setup did not write the selected preset');
  }
  if (!existsSync(join(project, '.cursor/mcp.json'))) {
    throw new Error('setup did not create MCP configuration');
  }

  const server = createMcpServer();
  const client = new Client({ name: 'codapult-golden-path', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const status = parseToolText(
      await client.callTool({ name: 'codapult_project_status', arguments: {} }),
    );
    if (status.name !== 'codapult') throw new Error('MCP status did not identify the project');

    const generated = parseToolText(
      await client.callTool({
        name: 'codapult_generate_page',
        arguments: { name: 'saved-reports' },
      }),
    );
    const generatedPath = join(
      project,
      'src/app/[locale]/(protected)/(dashboard)/dashboard/saved-reports/page.tsx',
    );
    if (!generated.created || generated.path !== generatedPath || !existsSync(generatedPath)) {
      throw new Error('MCP generation did not create the expected page');
    }

    run('pnpm', ['test'], project);

    const guardInit = parseToolText(
      await client.callTool({
        name: 'codapult_guard_init',
        arguments: { root: project, confirm: true, no_wait: true },
      }),
    );
    if (guardInit.status !== 'ok') throw new Error('Guard initialization failed');

    const proposal = parseToolText(
      await client.callTool({
        name: 'codapult_guard_propose',
        arguments: { root: project, persist: true, confirm: true },
      }),
    );
    if (proposal.status !== 'ok' || !proposal.persisted) {
      throw new Error('Guard proposal was not persisted');
    }

    const verify = parseToolText(
      await client.callTool({
        name: 'codapult_guard_verify',
        arguments: {
          root: project,
          checks: ['test'],
          project_checks: true,
          tools: 'off',
        },
      }),
    );
    if (verify.outcome !== 'pass' || verify.checks?.test?.status !== 'passed') {
      throw new Error(`Guard verification failed: ${JSON.stringify(verify)}`);
    }

    console.log(
      JSON.stringify(
        {
          setup: 'passed',
          run: 'passed',
          mcp: 'passed',
          generate: generatedPath,
          guard: 'passed',
          test: 'passed',
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
    await server.close();
  }
}

try {
  await main();
} finally {
  rmSync(source, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
