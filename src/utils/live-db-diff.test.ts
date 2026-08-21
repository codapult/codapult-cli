import { describe, expect, it } from 'vitest';
import { diffSchemaWithLiveDatabase } from './live-db-diff.js';

describe('diffSchemaWithLiveDatabase', () => {
  it('compares physical column names and normalizes SQL types', () => {
    const differences = diffSchemaWithLiveDatabase(
      [
        {
          name: 'users',
          columns: [
            { name: 'displayName', databaseName: 'display_name', type: 'text', constraints: [] },
            { name: 'id', databaseName: 'id', type: 'uuid', constraints: ['PRIMARY KEY'] },
          ],
        },
      ],
      [
        {
          name: 'users',
          columns: [
            { name: 'display_name', type: 'text', constraints: [] },
            { name: 'legacy', type: 'text', constraints: [] },
          ],
        },
        { name: 'orphan', columns: [] },
      ],
    );
    expect(differences).toEqual([
      { table: 'users', issue: 'column_missing_in_database', details: 'id' },
      { table: 'users', issue: 'column_missing_in_schema', details: 'legacy' },
      { table: 'orphan', issue: 'missing_in_schema' },
    ]);
  });
});
