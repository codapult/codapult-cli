import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENV_FILE_NAME } from '../../utils/project-env.js';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('../../utils/project.js', () => ({
  findProjectRoot: vi.fn(),
  readProjectFile: vi.fn(),
  readJsonFile: vi.fn(),
}));
vi.mock('../../utils/project-env.js', () => ({
  ENV_FILE_NAME: '.env.local',
  getProjectEnvOptions: vi.fn((envSource?: string) => ({ envFile: envSource !== 'process' })),
  getProjectEnvSource: vi.fn((options?: { envFile?: boolean }) =>
    options?.envFile === false ? 'process' : 'file',
  ),
  loadProjectEnv: vi.fn(),
}));

const { existsSync, readFileSync, readdirSync } = await import('node:fs');
const { execSync } = await import('node:child_process');
const { findProjectRoot, readProjectFile, readJsonFile } = await import('../../utils/project.js');
const { loadProjectEnv } = await import('../../utils/project-env.js');
const { registerProjectTools } = await import('./project.js');

const mockedFindRoot = vi.mocked(findProjectRoot);
const mockedReadProject = vi.mocked(readProjectFile);
const mockedLoadProjectEnv = vi.mocked(loadProjectEnv);
const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);
const mockedReaddir = vi.mocked(readdirSync);
const mockedReadJson = vi.mocked(readJsonFile);
const mockedExec = vi.mocked(execSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockedFindRoot.mockReturnValue('/project');
  mockedLoadProjectEnv.mockReturnValue({
    source: 'file',
    filePath: `/project/${ENV_FILE_NAME}`,
    fileExists: false,
    content: '',
  });
  mockedReaddir.mockReturnValue([]);
  mockedReadJson.mockReturnValue({ name: 'codapult', version: '1.0.0' });
});

interface ToolRegistration {
  name: string;
  handler: (args: Record<string, unknown>) => {
    content: { type: string; text: string }[];
  };
}

function createMockServer(): {
  registerTool: ReturnType<typeof vi.fn>;
  tools: ToolRegistration[];
} {
  const tools: ToolRegistration[] = [];
  const registerTool = vi.fn(
    (name: string, _opts: unknown, handler: ToolRegistration['handler']) => {
      tools.push({ name, handler });
    },
  );
  return { registerTool, tools };
}

describe('registerProjectTools', () => {
  it('registers project inspection and execution tools', () => {
    const server = createMockServer();
    registerProjectTools(server as never);

    expect(server.tools).toHaveLength(6);
    const names = server.tools.map((t) => t.name);
    expect(names).toContain('codapult_project_status');
    expect(names).toContain('codapult_project_config');
    expect(names).toContain('codapult_run_checks');
    expect(names).toContain('codapult_doctor');
    expect(names).toContain('codapult_project_context');
    expect(names).toContain('codapult_build');
  });

  describe('codapult_project_status', () => {
    it('returns project info with adapters and plugins', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedRead.mockReturnValue(JSON.stringify({ name: 'codapult', version: '1.0.0' }));
      mockedLoadProjectEnv.mockReturnValue({
        source: 'file',
        filePath: `/project/${ENV_FILE_NAME}`,
        fileExists: true,
        content: [
          'AUTH_PROVIDER=kinde',
          'PAYMENT_PROVIDER=lemonsqueezy',
          'STORAGE_PROVIDER=s3',
          'ENABLE_TEAMS=false',
          'GOOGLE_CLIENT_ID=abc',
          'GOOGLE_CLIENT_SECRET=def',
        ].join('\n'),
      });
      mockedExists.mockReturnValue(true);
      mockedReaddir.mockReturnValue(['ai-kit.ts', 'crm.ts', 'index.ts'] as unknown as ReturnType<
        typeof readdirSync
      >);
      mockedExec.mockImplementation((cmd: string) => {
        if (cmd.includes('branch')) return Buffer.from('main');
        if (cmd.includes('porcelain')) return Buffer.from('');
        return Buffer.from('');
      });

      const handler = server.tools.find((t) => t.name === 'codapult_project_status')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        name: string;
        adapters: Record<string, string>;
        oauthProviders: string[];
        plugins: string[];
        features: { enabled: string[]; disabled: string[] };
        git: { branch: string; dirty: boolean };
      };

      expect(parsed.name).toBe('codapult');
      expect(parsed.adapters.auth).toBe('kinde');
      expect(parsed.adapters.payments).toBe('lemonsqueezy');
      expect(parsed.adapters.storage).toBe('s3');
      expect(parsed.adapters.database).toBe('turso');
      expect(parsed.adapters.embedding).toBe('openai');
      expect(parsed.adapters.vectorStore).toBe('sqlite');
      expect(parsed.oauthProviders).toEqual(['google']);
      expect(parsed.plugins).toEqual(['ai-kit', 'crm']);
      expect(parsed.features.enabled).toContain('aiChat');
      expect(parsed.features.enabled).toContain('blog');
      expect(parsed.features.disabled).toContain('teams');
      expect(parsed.git.branch).toBe('main');
      expect(parsed.git.dirty).toBe(false);
    });

    it('uses process env when requested', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedRead.mockReturnValue(JSON.stringify({ name: 'codapult', version: '1.0.0' }));
      mockedLoadProjectEnv.mockReturnValue({
        source: 'process',
        filePath: `/project/${ENV_FILE_NAME}`,
        fileExists: false,
        content: 'AUTH_PROVIDER=none\nENABLE_BLOG=false',
      });
      mockedExists.mockReturnValue(true);
      mockedReaddir.mockReturnValue([]);

      const handler = server.tools.find((t) => t.name === 'codapult_project_status')!.handler;
      const result = handler({ env_source: 'process' });
      const parsed = JSON.parse(result.content[0].text) as { adapters: { auth: string } };

      expect(parsed.adapters.auth).toBe('none');
      expect(mockedLoadProjectEnv).toHaveBeenCalledWith('/project', { envFile: false });
    });
  });

  describe('codapult_project_config', () => {
    it('returns app.ts content', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedReadProject.mockReturnValue('export const appConfig = { brand: "test" };');

      const handler = server.tools.find((t) => t.name === 'codapult_project_config')!.handler;
      const result = handler({});

      expect(result.content[0].text).toContain('appConfig');
    });

    it('returns fallback message when config not found', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedReadProject.mockReturnValue(undefined);

      const handler = server.tools.find((t) => t.name === 'codapult_project_config')!.handler;
      const result = handler({});

      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('codapult_doctor', () => {
    it('checks required files and TypeScript compilation', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedExists.mockReturnValue(true);
      mockedExec.mockReturnValue(Buffer.from(''));

      const handler = server.tools.find((t) => t.name === 'codapult_doctor')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        checks: { id: string; status: string }[];
      };

      const pkgCheck = parsed.checks.find((c) => c.id === 'package');
      expect(pkgCheck?.status).toBe('ok');

      const tsCheck = parsed.checks.find((c) => c.id === 'typecheck');
      expect(tsCheck?.status).toBe('ok');
    });

    it('reports missing files', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedExists.mockReturnValue(false);
      mockedExec.mockImplementation(() => {
        throw new Error('compile error');
      });

      const handler = server.tools.find((t) => t.name === 'codapult_doctor')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        checks: { status: string }[];
      };

      const failedChecks = parsed.checks.filter((c) => c.status === 'fail');
      expect(failedChecks.length).toBeGreaterThan(0);
    });

    it('reports process env source when requested', () => {
      const server = createMockServer();
      registerProjectTools(server as never);

      mockedExists.mockReturnValue(true);
      mockedExec.mockReturnValue(Buffer.from(''));
      mockedLoadProjectEnv.mockReturnValue({
        source: 'process',
        filePath: `/project/${ENV_FILE_NAME}`,
        fileExists: false,
        content: '',
      });

      const handler = server.tools.find((t) => t.name === 'codapult_doctor')!.handler;
      const result = handler({ env_source: 'process' });
      const parsed = JSON.parse(result.content[0].text) as {
        checks: { id: string; message: string }[];
      };

      const envCheck = parsed.checks.find((c) => c.id === 'env-file');
      expect(envCheck?.message).toBe('Using process.env');
    });
  });
});
