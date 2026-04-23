import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../../utils/project.js';
import { loadProjectEnv } from '../../utils/project-env.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

interface TableInfo {
  name: string;
  columns: {
    name: string;
    type: string;
    constraints: string[];
  }[];
}

function parseSchema(content: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const tableRegex =
    /export\s+const\s+(\w+)\s*=\s*(?:sqliteTable|pgTable)\(\s*['"](\w+)['"]\s*,\s*\{/g;

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[2];

    const startIdx = match.index + match[0].length;
    let depth = 1;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length && depth > 0; i += 1) {
      if (content[i] === '{') depth += 1;
      if (content[i] === '}') depth -= 1;
      endIdx = i;
    }

    const body = content.slice(startIdx, endIdx);
    const columns: TableInfo['columns'] = [];

    const colRegex =
      /(\w+)\s*:\s*(text|integer|real|blob|boolean|timestamp|serial)\(['"](\w+)['"]/g;
    let colMatch;
    while ((colMatch = colRegex.exec(body)) !== null) {
      const colName = colMatch[1];
      const colType = colMatch[2];
      const constraints: string[] = [];

      const lineEnd = body.indexOf('\n', colMatch.index + colMatch[0].length);
      const restOfLine = body.slice(colMatch.index, lineEnd > -1 ? lineEnd : undefined);

      if (restOfLine.includes('.primaryKey()')) constraints.push('PRIMARY KEY');
      if (restOfLine.includes('.notNull()')) constraints.push('NOT NULL');
      if (restOfLine.includes('.unique()')) constraints.push('UNIQUE');
      if (restOfLine.includes('.references(')) constraints.push('FK');
      if (restOfLine.includes('.$defaultFn(')) constraints.push('DEFAULT');

      columns.push({ name: colName, type: colType, constraints });
    }

    tables.push({ name: tableName, columns });
  }

  return tables;
}

export function registerDbTools(server: McpServer): void {
  server.registerTool(
    'codapult_db_get_tables',
    {
      title: 'Get Database Tables',
      description: 'List all tables in the database schema with column counts',
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const content = readProjectFile(root, 'src/lib/db/schema.ts');
      if (!content)
        return {
          content: [{ type: 'text' as const, text: 'Schema file not found' }],
          isError: true,
        };

      const tables = parseSchema(content);
      const summary = tables.map((t) => ({
        name: t.name,
        columns: t.columns.length,
        columnNames: t.columns.map((c) => c.name),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_db_get_table_info',
    {
      title: 'Get Table Info',
      description:
        'Get detailed column info for a specific database table (columns, types, constraints)',
      inputSchema: {
        table: z.string().describe('Table name (e.g. "user", "subscription")'),
      },
    },
    ({ table }) => {
      const root = getRoot();
      const content = readProjectFile(root, 'src/lib/db/schema.ts');
      if (!content)
        return {
          content: [{ type: 'text' as const, text: 'Schema file not found' }],
          isError: true,
        };

      const tables = parseSchema(content);
      const found = tables.find((t) => t.name === table);
      if (!found) {
        const available = tables.map((t) => t.name).join(', ');
        return {
          content: [
            { type: 'text' as const, text: `Table "${table}" not found. Available: ${available}` },
          ],
          isError: true,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(found, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_db_status',
    {
      title: 'Database Status',
      description: 'Get database provider, table count, and migration count',
      inputSchema: {},
    },
    () => {
      const root = getRoot();

      const envContent = loadProjectEnv(root).content;
      const providerMatch = /^DB_PROVIDER\s*=\s*"?(\w+)"?/m.exec(envContent);
      const provider = providerMatch?.[1] ?? 'turso';

      const schemaContent = readProjectFile(root, 'src/lib/db/schema.ts') ?? '';
      const tables = parseSchema(schemaContent);

      let sqliteMigrations = 0;
      let pgMigrations = 0;
      const migrDir = resolve(root, 'src/lib/db/migrations');
      const migrPgDir = resolve(root, 'src/lib/db/migrations-pg');
      if (existsSync(migrDir)) {
        sqliteMigrations = readdirSync(migrDir).filter((f) => f.endsWith('.sql')).length;
      }
      if (existsSync(migrPgDir)) {
        pgMigrations = readdirSync(migrPgDir).filter((f) => f.endsWith('.sql')).length;
      }

      const result = { provider, tableCount: tables.length, sqliteMigrations, pgMigrations };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
