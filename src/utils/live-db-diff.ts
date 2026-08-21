import { execFileSync } from 'node:child_process';
import { getAdapters, readEnvVar } from './env-config.js';
import type { ParsedTable } from './schema-parser.js';

export interface LiveDatabaseColumn {
  name: string;
  type: string;
  constraints: string[];
}

export interface LiveDatabaseTable {
  name: string;
  columns: LiveDatabaseColumn[];
}

export interface DatabaseDrift {
  table: string;
  issue:
    | 'missing_in_database'
    | 'missing_in_schema'
    | 'column_missing_in_database'
    | 'column_missing_in_schema'
    | 'column_type_differs';
  details?: unknown;
}

const INSPECTOR_SCRIPT = String.raw`
const provider = process.env.CODAPULT_DB_PROVIDER;
const output = (tables) => process.stdout.write(JSON.stringify(tables));
if (provider === 'turso') {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  const rows = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name")).rows;
  const tables = [];
  for (const row of rows) {
    const name = String(row.name);
    const escaped = name.replaceAll('"', '""');
    const [columnsResult, foreignKeysResult] = await Promise.all([
      client.execute('PRAGMA table_info("' + escaped + '")'),
      client.execute('PRAGMA foreign_key_list("' + escaped + '")'),
    ]);
    const foreignKeys = new Set(foreignKeysResult.rows.map((key) => String(key.from)));
    tables.push({ name, columns: columnsResult.rows.map((column) => {
      const constraints = [];
      if (Number(column.pk) > 0) constraints.push('PRIMARY KEY');
      if (Number(column.notnull) > 0) constraints.push('NOT NULL');
      if (column.dflt_value != null) constraints.push('DEFAULT');
      if (foreignKeys.has(String(column.name))) constraints.push('FK');
      return { name: String(column.name), type: String(column.type).toLowerCase(), constraints };
    }) });
  }
  client.close();
  output(tables);
} else {
  const postgres = (await import('postgres')).default;
  const sql = postgres(process.env.DATABASE_URL);
  const result = await sql.unsafe(
    "SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default, " +
    "COALESCE(array_agg(tc.constraint_type) FILTER (WHERE tc.constraint_type IS NOT NULL), '{}') AS constraints " +
    "FROM information_schema.columns c " +
    "LEFT JOIN information_schema.key_column_usage kcu ON c.table_schema=kcu.table_schema AND c.table_name=kcu.table_name AND c.column_name=kcu.column_name " +
    "LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_schema=tc.constraint_schema AND kcu.constraint_name=tc.constraint_name AND kcu.table_name=tc.table_name " +
    "WHERE c.table_schema='public' AND c.table_name != '__drizzle_migrations' GROUP BY c.table_name,c.column_name,c.data_type,c.is_nullable,c.column_default ORDER BY c.table_name,c.ordinal_position"
  );
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, { name: row.table_name, columns: [] });
    const constraints = [];
    if (row.constraints.includes('PRIMARY KEY')) constraints.push('PRIMARY KEY');
    if (row.is_nullable === 'NO') constraints.push('NOT NULL');
    if (row.constraints.includes('FOREIGN KEY')) constraints.push('FK');
    if (row.column_default != null) constraints.push('DEFAULT');
    if (row.constraints.includes('UNIQUE')) constraints.push('UNIQUE');
    map.get(row.table_name).columns.push({ name: row.column_name, type: row.data_type.toLowerCase(), constraints });
  }
  await sql.end({ timeout: 5 });
  output([...map.values()]);
}
`;

function databaseEnv(envContent: string): NodeJS.ProcessEnv {
  const adapters = getAdapters(envContent);
  return {
    CODAPULT_DB_PROVIDER: adapters.database,
    TURSO_DATABASE_URL: readEnvVar(envContent, 'TURSO_DATABASE_URL'),
    TURSO_AUTH_TOKEN: readEnvVar(envContent, 'TURSO_AUTH_TOKEN'),
    DATABASE_URL: readEnvVar(envContent, 'DATABASE_URL'),
  };
}

export function inspectLiveDatabase(root: string, envContent: string): LiveDatabaseTable[] {
  const env = databaseEnv(envContent);
  const requiredKey =
    env.CODAPULT_DB_PROVIDER === 'postgres' ? 'DATABASE_URL' : 'TURSO_DATABASE_URL';
  if (!env[requiredKey]) throw new Error(`${requiredKey} is required to inspect the live database`);
  try {
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', INSPECTOR_SCRIPT],
      {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      },
    ).toString();
    return JSON.parse(output) as LiveDatabaseTable[];
  } catch {
    throw new Error(
      'Could not inspect the live database. Verify connectivity and database credentials.',
    );
  }
}

function normalizedType(type: string): string {
  const value = type.toLowerCase().replaceAll(/\s+/g, '');
  if (value === 'character varying') return 'varchar';
  if (value === 'timestamp without timezone') return 'timestamp';
  if (value === 'double precision') return 'doubleprecision';
  return value;
}

export function diffSchemaWithLiveDatabase(
  schema: ParsedTable[],
  database: LiveDatabaseTable[],
): DatabaseDrift[] {
  const sourceTables = new Map(schema.map((table) => [table.name, table]));
  const liveTables = new Map(database.map((table) => [table.name, table]));
  const differences: DatabaseDrift[] = [];
  for (const name of new Set([...sourceTables.keys(), ...liveTables.keys()])) {
    const source = sourceTables.get(name);
    const live = liveTables.get(name);
    if (!live) {
      differences.push({ table: name, issue: 'missing_in_database' });
      continue;
    }
    if (!source) {
      differences.push({ table: name, issue: 'missing_in_schema' });
      continue;
    }
    const sourceColumns = new Map(source.columns.map((column) => [column.databaseName, column]));
    const liveColumns = new Map(live.columns.map((column) => [column.name, column]));
    for (const columnName of new Set([...sourceColumns.keys(), ...liveColumns.keys()])) {
      const sourceColumn = sourceColumns.get(columnName);
      const liveColumn = liveColumns.get(columnName);
      if (!liveColumn) {
        differences.push({ table: name, issue: 'column_missing_in_database', details: columnName });
        continue;
      }
      if (!sourceColumn) {
        differences.push({ table: name, issue: 'column_missing_in_schema', details: columnName });
        continue;
      }
      if (normalizedType(sourceColumn.type) !== normalizedType(liveColumn.type)) {
        differences.push({
          table: name,
          issue: 'column_type_differs',
          details: { column: columnName, schema: sourceColumn.type, database: liveColumn.type },
        });
      }
    }
  }
  return differences;
}
