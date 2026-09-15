import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENV_FILE_NAME } from '../../utils/project-env.js';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('../../utils/project.js', () => ({
  checkProjectRoot: vi.fn(),
  readProjectFile: vi.fn(),
}));

const { existsSync, readdirSync } = await import('node:fs');
const { checkProjectRoot, readProjectFile } = await import('../../utils/project.js');
const { registerDbTools } = await import('./db.js');

const mockedFindRoot = vi.mocked(checkProjectRoot);
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
  it('registers database inspection and mutation tools', () => {
    const server = createMockServer();
    registerDbTools(server as never);

    expect(server.tools).toHaveLength(9);
    expect(server.tools.map((t) => t.name)).toEqual([
      'codapult_db_generate',
      'codapult_db_migration_diff',
      'codapult_db_push',
      'codapult_db_seed',
      'codapult_db_get_tables',
      'codapult_db_get_table_info',
      'codapult_db_status',
      'codapult_db_live_diff',
      'codapult_db_schema_diff',
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
      const parsed = JSON.parse(result.content[0].text) as {
        provider: string;
        schemaPath: string;
        tables: { name: string; columns: number }[];
      };

      expect(parsed.provider).toBe('turso');
      expect(parsed.schemaPath).toBe('src/lib/db/schema.ts');
      expect(parsed.tables).toHaveLength(2);
      expect(parsed.tables[0].name).toBe('user');
      expect(parsed.tables[0].columns).toBe(3);
      expect(parsed.tables[1].name).toBe('post');
      expect(parsed.tables[1].columns).toBe(3);
    });

    it('returns error when schema file not found', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      mockedReadProject.mockReturnValue(undefined);

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
        if (path === ENV_FILE_NAME) return envContent;
        if (path === 'src/lib/db/schema.ts') return schema;
        return undefined;
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
        if (path === ENV_FILE_NAME) return '';
        if (path === 'src/lib/db/schema.ts') return '';
        return undefined;
      });
      mockedExists.mockReturnValue(false);

      const handler = server.tools.find((t) => t.name === 'codapult_db_status')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as { provider: string };

      expect(parsed.provider).toBe('turso');
    });

    it('can read provider from process env', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      vi.stubEnv('DB_PROVIDER', 'postgres');
      mockedReadProject.mockImplementation((_root, path) => {
        if (path === 'src/lib/db/schema.ts') return '';
        return undefined;
      });
      mockedExists.mockReturnValue(false);

      const handler = server.tools.find((t) => t.name === 'codapult_db_status')!.handler;
      const result = handler({ env_source: 'process' });
      const parsed = JSON.parse(result.content[0].text) as { provider: string };

      expect(parsed.provider).toBe('postgres');
    });
  });

  describe('codapult_db_schema_diff', () => {
    it('returns an ok parity report for matching schemas', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      const sqlite = `export const user = sqliteTable('user', { id: text('id') });`;
      const postgres = `export const user = pgTable('user', { id: text('id') });`;
      mockedReadProject.mockImplementation((_root, path) => {
        if (path === 'src/lib/db/schema.ts') return sqlite;
        if (path === 'src/lib/db/schema-pg.ts') return postgres;
        return undefined;
      });

      const handler = server.tools.find((t) => t.name === 'codapult_db_schema_diff')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        status: string;
        identical: boolean;
        differences: unknown[];
      };

      expect(result.isError).toBe(false);
      expect(parsed.status).toBe('ok');
      expect(parsed.identical).toBe(true);
      expect(parsed.differences).toEqual([]);
    });

    it('returns an error result for missing tables', () => {
      const server = createMockServer();
      registerDbTools(server as never);

      mockedReadProject.mockImplementation((_root, path) => {
        if (path === 'src/lib/db/schema.ts') {
          return `export const user = sqliteTable('user', { id: text('id') });`;
        }
        if (path === 'src/lib/db/schema-pg.ts') {
          return `export const post = pgTable('post', { id: text('id') });`;
        }
        return undefined;
      });

      const handler = server.tools.find((t) => t.name === 'codapult_db_schema_diff')!.handler;
      const result = handler({});
      const parsed = JSON.parse(result.content[0].text) as {
        status: string;
        differences: { issue: string }[];
      };

      expect(result.isError).toBe(true);
      expect(parsed.status).toBe('fail');
      expect(parsed.differences.map((difference) => difference.issue)).toEqual([
        'missing_in_postgres',
        'missing_in_sqlite',
      ]);
    });
  });
});
