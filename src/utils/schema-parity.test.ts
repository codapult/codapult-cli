import { describe, expect, it } from 'vitest';
import { compareSchemaFiles } from './schema-parity.js';

const column = (
  databaseName: string,
  type: string,
): {
  name: string;
  databaseName: string;
  type: string;
  constraints: string[];
} => ({
  name: databaseName,
  databaseName,
  type,
  constraints: [],
});

describe('compareSchemaFiles', () => {
  it('accepts provider-specific representations of shared types', () => {
    const report = compareSchemaFiles(
      [{ name: 'users', columns: [column('id', 'text'), column('created_at', 'integer')] }],
      [{ name: 'users', columns: [column('id', 'text'), column('created_at', 'timestamp')] }],
    );

    expect(report).toEqual({ status: 'ok', identical: true, differences: [] });
  });

  it('fails for missing tables and columns', () => {
    const report = compareSchemaFiles(
      [{ name: 'users', columns: [column('id', 'text')] }],
      [{ name: 'posts', columns: [column('id', 'text'), column('title', 'text')] }],
    );

    expect(report.status).toBe('fail');
    expect(report.differences).toEqual([
      { table: 'users', issue: 'missing_in_postgres', severity: 'fail' },
      { table: 'posts', issue: 'missing_in_sqlite', severity: 'fail' },
    ]);
  });

  it('warns for an incompatible column type without failing structural parity', () => {
    const report = compareSchemaFiles(
      [{ name: 'users', columns: [column('id', 'text')] }],
      [{ name: 'users', columns: [column('id', 'integer')] }],
    );

    expect(report.status).toBe('warn');
    expect(report.differences[0]?.severity).toBe('warn');
  });
});
