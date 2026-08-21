import type { ParsedTable } from './schema-parser.js';

export type SchemaParityStatus = 'ok' | 'warn' | 'fail';

export type SchemaParityIssue =
  | 'missing_in_sqlite'
  | 'missing_in_postgres'
  | 'column_missing_in_sqlite'
  | 'column_missing_in_postgres'
  | 'column_type_differs';

export interface SchemaParityDifference {
  table: string;
  issue: SchemaParityIssue;
  severity: Exclude<SchemaParityStatus, 'ok'>;
  details?: unknown;
}

export interface SchemaParityReport {
  status: SchemaParityStatus;
  identical: boolean;
  differences: SchemaParityDifference[];
}

function typeGroup(type: string): string {
  const normalized = type.toLowerCase().replaceAll(/\s+/g, '');
  if (['text', 'varchar', 'char', 'uuid', 'json', 'jsonb'].includes(normalized)) return 'text';
  if (['integer', 'serial', 'bigint', 'smallint'].includes(normalized)) return 'integer';
  if (['real', 'doubleprecision', 'numeric', 'decimal'].includes(normalized)) return 'real';
  if (['timestamp', 'date', 'time'].includes(normalized)) return 'datetime';
  if (['boolean', 'bool'].includes(normalized)) return 'boolean';
  if (['blob', 'bytea'].includes(normalized)) return 'binary';
  return normalized;
}

/**
 * SQLite and PostgreSQL use different physical representations for several
 * shared Drizzle types (for example SQLite integer vs PostgreSQL timestamp).
 * Compare semantic groups so the check catches real drift without flagging
 * the expected provider-specific representation.
 */
function compatibleTypes(sqliteType: string, postgresType: string): boolean {
  const sqliteGroup = typeGroup(sqliteType);
  const postgresGroup = typeGroup(postgresType);
  if (sqliteGroup === postgresGroup) return true;
  if (sqliteGroup === 'integer' && ['datetime', 'boolean'].includes(postgresGroup)) return true;
  if (sqliteGroup === 'text' && postgresGroup === 'text') return true;
  return false;
}

export function compareSchemaFiles(
  sqlite: ParsedTable[],
  postgres: ParsedTable[],
): SchemaParityReport {
  const sqliteTables = new Map(sqlite.map((table) => [table.name, table]));
  const postgresTables = new Map(postgres.map((table) => [table.name, table]));
  const differences: SchemaParityDifference[] = [];

  for (const tableName of new Set([...sqliteTables.keys(), ...postgresTables.keys()])) {
    const sqliteTable = sqliteTables.get(tableName);
    const postgresTable = postgresTables.get(tableName);
    if (!sqliteTable) {
      differences.push({ table: tableName, issue: 'missing_in_sqlite', severity: 'fail' });
      continue;
    }
    if (!postgresTable) {
      differences.push({ table: tableName, issue: 'missing_in_postgres', severity: 'fail' });
      continue;
    }

    const sqliteColumns = new Map(
      sqliteTable.columns.map((column) => [column.databaseName, column]),
    );
    const postgresColumns = new Map(
      postgresTable.columns.map((column) => [column.databaseName, column]),
    );
    for (const columnName of new Set([...sqliteColumns.keys(), ...postgresColumns.keys()])) {
      const sqliteColumn = sqliteColumns.get(columnName);
      const postgresColumn = postgresColumns.get(columnName);
      if (!sqliteColumn) {
        differences.push({
          table: tableName,
          issue: 'column_missing_in_sqlite',
          severity: 'fail',
          details: columnName,
        });
        continue;
      }
      if (!postgresColumn) {
        differences.push({
          table: tableName,
          issue: 'column_missing_in_postgres',
          severity: 'fail',
          details: columnName,
        });
        continue;
      }
      if (!compatibleTypes(sqliteColumn.type, postgresColumn.type)) {
        differences.push({
          table: tableName,
          issue: 'column_type_differs',
          severity: 'warn',
          details: { column: columnName, sqlite: sqliteColumn.type, postgres: postgresColumn.type },
        });
      }
    }
  }

  return {
    status: differences.some((difference) => difference.severity === 'fail')
      ? 'fail'
      : differences.length > 0
        ? 'warn'
        : 'ok',
    identical: differences.length === 0,
    differences,
  };
}
