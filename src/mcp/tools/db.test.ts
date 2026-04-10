import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('../../utils/project.js', () => ({
  findProjectRoot: vi.fn(),
  readProjectFile: vi.fn(),
}));

const { existsSync, readdirSync } = await import('node:fs');
const { findProjectRoot, readProjectFile } = await import('../../utils/project.js');
const { registerDbTools } = await import('./db.js');

const mockedFindRoot = vi.mocked(findProjectRoot);
const mockedReadProject = vi.mocked(readProjectFile);
const mockedExists = vi.mocked(existsSync);
const mockedReaddir = vi.mocked(readdirSync);

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

describe('registerDbTools', () => {
  it('registers 3 DB tools', () => {
    const server = createMockServer();
    registerDbTools(server as never);

    expect(server.tools).toHaveLength(3);
    expect(server.tools.map((t) => t.name)).toEqual([
      'codapult_db_get_tables',
      'codapult_db_get_table_info',
      'codapult_db_status',
    ]);
  });

  describe('codapult_db_get_tables', () => {
    it('parses schema and returns table summary', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      const schema = `
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age'),
});

export const post = sqliteTable('post', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userId: text('user_id').references(() => user.id),
});
`;
      mockedReadProject.mockReturnValue(schema);

      const handler = server.tools.find((t) => t.name === 'codapult_db_get_tables')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as { name: string; columns: number }[];

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('user');
      expect(parsed[0].columns).toBe(3);
      expect(parsed[1].name).toBe('post');
      expect(parsed[1].columns).toBe(3);
    });

    it('returns error when schema file not found', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      mockedReadProject.mockReturnValue(null);

      const handler = server.tools.find((t) => t.name === 'codapult_db_get_tables')!.handler;
      const result = handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('codapult_db_get_table_info', () => {
    it('returns detailed info for a specific table', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      const schema = `
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').$defaultFn(() => new Date()),
});
`;
      mockedReadProject.mockReturnValue(schema);

      const handler = server.tools.find((t) => t.name === 'codapult_db_get_table_info')!.handler;
      const result = handler({ table: 'user' });
      const parsed = JSON.parse(result.content[0].text) as {
        name: string;
        columns: { name: string; type: string; constraints: string[] }[];
      };

      expect(parsed.name).toBe('user');
      expect(parsed.columns).toHaveLength(3);

      const idCol = parsed.columns.find((c) => c.name === 'id')!;
      expect(idCol.type).toBe('text');
      expect(idCol.constraints).toContain('PRIMARY KEY');

      const emailCol = parsed.columns.find((c) => c.name === 'email')!;
      expect(emailCol.constraints).toContain('NOT NULL');
      expect(emailCol.constraints).toContain('UNIQUE');

      const createdAtCol = parsed.columns.find((c) => c.name === 'createdAt')!;
      expect(createdAtCol.constraints).toContain('DEFAULT');
    });

    it('returns error for non-existent table', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      const schema = `export const user = sqliteTable('user', { id: text('id') });`;
      mockedReadProject.mockReturnValue(schema);

      const handler = server.tools.find((t) => t.name === 'codapult_db_get_table_info')!.handler;
      const result = handler({ table: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('user');
    });
  });

  describe('codapult_db_status', () => {
    it('returns provider, table count, and migration counts', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      const envContent = 'DB_PROVIDER=turso\nOTHER=val';
      const schema = `export const user = sqliteTable('user', { id: text('id') });`;

      mockedReadProject.mockImplementation((_root, path) => {
        if (path === '.env.local') return envContent;
        if (path === 'src/lib/db/schema.ts') return schema;
        return null;
      });
      mockedExists.mockReturnValue(true);
      mockedReaddir.mockReturnValue(['0001.sql', '0002.sql', 'meta'] as unknown as ReturnType<
        typeof readdirSync
      >);

      const handler = server.tools.find((t) => t.name === 'codapult_db_status')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        provider: string;
        tableCount: number;
        sqliteMigrations: number;
      };

      expect(parsed.provider).toBe('turso');
      expect(parsed.tableCount).toBe(1);
      expect(parsed.sqliteMigrations).toBe(2);
    });

    it('defaults provider to turso when not set', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      mockedReadProject.mockImplementation((_root, path) => {
        if (path === '.env.local') return '';
        if (path === 'src/lib/db/schema.ts') return '';
        return null;
      });
      mockedExists.mockReturnValue(false);

      const handler = server.tools.find((t) => t.name === 'codapult_db_status')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as { provider: string };

      expect(parsed.provider).toBe('turso');
    });
  });
});
