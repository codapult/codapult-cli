import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs');
vi.mock('../../utils/project.js', () => ({
  findProjectRoot: vi.fn(),
  readProjectFile: vi.fn(),
}));

const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
const { findProjectRoot, readProjectFile } = await import('../../utils/project.js');
const { registerEnvTools } = await import('./env.js');

const mockedFindRoot = vi.mocked(findProjectRoot);
const mockedReadProject = vi.mocked(readProjectFile);
const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);
const mockedWrite = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockedFindRoot.mockReturnValue('/project');
});

interface ToolRegistration {
  name: string;
  handler: (args: Record<string, string>) => {
    content: { type: string; text: string }[];
    isError?: boolean;
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

describe('registerEnvTools', () => {
  it('registers 3 env tools', () => {
    const server = createMockServer();
    registerEnvTools(server as never);

    expect(server.tools).toHaveLength(3);
    expect(server.tools.map((t) => t.name)).toEqual([
      'codapult_env_schema',
      'codapult_env_read',
      'codapult_env_update',
    ]);
  });

  describe('codapult_env_schema', () => {
    it('parses .env.example entries with comments', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      const envExample = `# Auth provider
AUTH_PROVIDER=better-auth
# Stripe secret key
STRIPE_SECRET_KEY=sk_test_xxx
# === Section header ===
# Optional database URL
DATABASE_URL=sqlite://local.db
`;
      mockedReadProject.mockReturnValue(envExample);

      const handler = server.tools.find((t) => t.name === 'codapult_env_schema')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        key: string;
        value: string;
        comment?: string;
        required: boolean;
      }[];

      expect(parsed).toHaveLength(3);

      const authEntry = parsed.find((e) => e.key === 'AUTH_PROVIDER')!;
      expect(authEntry.value).toBe('better-auth');
      expect(authEntry.comment).toBe('Auth provider');
      expect(authEntry.required).toBe(true);

      const dbEntry = parsed.find((e) => e.key === 'DATABASE_URL')!;
      expect(dbEntry.value).toBe('sqlite://local.db');
      expect(dbEntry.comment).toBe('Optional database URL');
    });

    it('returns error when .env.example not found', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      mockedReadProject.mockReturnValue(null);

      const handler = server.tools.find((t) => t.name === 'codapult_env_schema')!.handler;
      const result = handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe('codapult_env_read', () => {
    it('reports missing and unconfigured variables', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      const envLocal = `AUTH_PROVIDER=better-auth\nSTRIPE_SECRET_KEY=your-key-here\n`;
      const envExample = `AUTH_PROVIDER=better-auth\nSTRIPE_SECRET_KEY=\nDATABASE_URL=\n`;

      mockedReadProject.mockImplementation((_root, path) => {
        if (path === '.env.local') return envLocal;
        if (path === '.env.example') return envExample;
        return null;
      });

      const handler = server.tools.find((t) => t.name === 'codapult_env_read')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        variables: { key: string; value: string }[];
        missing: string[];
        unconfigured: string[];
      };

      expect(parsed.missing).toContain('DATABASE_URL');
      expect(parsed.unconfigured).toContain('STRIPE_SECRET_KEY');
    });

    it('returns error when .env.local not found', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      mockedReadProject.mockReturnValue(null);

      const handler = server.tools.find((t) => t.name === 'codapult_env_read')!.handler;
      const result = handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe('codapult_env_update', () => {
    it('updates existing variable in .env.local', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      mockedExists.mockReturnValue(true);
      mockedRead.mockReturnValue('AUTH_PROVIDER=better-auth\nSTRIPE_KEY=old\n');

      const handler = server.tools.find((t) => t.name === 'codapult_env_update')!.handler;
      const result = handler({ key: 'STRIPE_KEY', value: 'sk_new_123' });

      expect(result.isError).toBeUndefined();
      const written = mockedWrite.mock.calls[0][1] as string;
      expect(written).toContain('STRIPE_KEY="sk_new_123"');
      expect(written).toContain('AUTH_PROVIDER=better-auth');
    });

    it('appends new variable when not present', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      mockedExists.mockReturnValue(true);
      mockedRead.mockReturnValue('AUTH_PROVIDER=better-auth\n');

      const handler = server.tools.find((t) => t.name === 'codapult_env_update')!.handler;
      handler({ key: 'NEW_VAR', value: 'new_value' });

      const written = mockedWrite.mock.calls[0][1] as string;
      expect(written).toContain('NEW_VAR="new_value"');
    });

    it('returns error when .env.local not found', () => {
      const server = createMockServer();
      registerEnvTools(server as never);

      mockedExists.mockReturnValue(false);

      const handler = server.tools.find((t) => t.name === 'codapult_env_update')!.handler;
      const result = handler({ key: 'X', value: 'Y' });

      expect(result.isError).toBe(true);
    });
  });
});
