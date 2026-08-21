import { describe, expect, it } from 'vitest';
import { parseDatabaseSchema } from './schema-parser.js';

describe('parseDatabaseSchema', () => {
  it('parses sqlite and postgres tables regardless of formatting', () => {
    const tables = parseDatabaseSchema(`
      export const account = sqliteTable(
        'account',
        { id: text('id').primaryKey().notNull(),
          owner_id: integer('owner_id', { mode: 'number' }).references(() => user.id),
          metadata: jsonb('metadata').$default(() => ({})), },
      );
      export const user = pgTable('user', {
        id: uuid('id').defaultRandom().primaryKey(),
        email: varchar('email', { length: 255 }).notNull().unique(),
      });
    `);

    expect(tables).toEqual([
      {
        name: 'account',
        columns: [
          {
            name: 'id',
            databaseName: 'id',
            type: 'text',
            constraints: ['PRIMARY KEY', 'NOT NULL'],
          },
          { name: 'owner_id', databaseName: 'owner_id', type: 'integer', constraints: ['FK'] },
          { name: 'metadata', databaseName: 'metadata', type: 'jsonb', constraints: ['DEFAULT'] },
        ],
      },
      {
        name: 'user',
        columns: [
          { name: 'id', databaseName: 'id', type: 'uuid', constraints: ['PRIMARY KEY'] },
          {
            name: 'email',
            databaseName: 'email',
            type: 'varchar',
            constraints: ['NOT NULL', 'UNIQUE'],
          },
        ],
      },
    ]);
  });

  it('ignores unrelated objects and supports quoted column keys', () => {
    const tables = parseDatabaseSchema(`
      const config = { id: text('not a table') };
      export const thing = sqliteTable('thing', { 'display-name': text('display-name') });
    `);
    expect(tables).toEqual([
      {
        name: 'thing',
        columns: [
          { name: 'display-name', databaseName: 'display-name', type: 'text', constraints: [] },
        ],
      },
    ]);
  });
});
