import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { runProjectCommand, type CommandResult } from './command.js';

export interface MigrationPreview {
  command: CommandResult;
  provider: 'turso' | 'postgres';
  schemaPath: string;
  migrationFiles: { name: string; sql: string }[];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function previewMigration(
  root: string,
  provider: 'turso' | 'postgres',
  schemaPath: string,
): MigrationPreview {
  const tempRoot = mkdtempSync(resolve(root, '.codapult-mcp-diff-'));
  const sourceMigrations = resolve(
    root,
    provider === 'postgres' ? 'src/lib/db/migrations-pg' : 'src/lib/db/migrations',
  );
  const tempMigrations = resolve(tempRoot, 'migrations');

  try {
    if (existsSync(sourceMigrations)) {
      cpSync(sourceMigrations, tempMigrations, { recursive: true });
    }

    const command = [
      'pnpm exec drizzle-kit generate',
      '--schema',
      shellQuote(resolve(root, schemaPath)),
      '--out',
      shellQuote(relative(root, tempMigrations)),
      '--dialect',
      provider === 'postgres' ? 'postgresql' : 'turso',
      '--name',
      'codapult-mcp-preview',
    ].join(' ');
    const result = runProjectCommand(command, root, { timeout: 120_000 });
    const migrationFiles =
      result.passed && existsSync(tempMigrations)
        ? readdirSync(tempMigrations)
            .filter((file) => file.endsWith('.sql') && file.includes('codapult-mcp-preview'))
            .map((name) => ({ name, sql: readFileSync(resolve(tempMigrations, name), 'utf-8') }))
        : [];

    return { command: result, provider, schemaPath, migrationFiles };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
