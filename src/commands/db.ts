import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, info, dim, warn } from '../utils/ui.js';

function run(cmd: string, cwd: string): void {
  info(`Running: ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
    success('Done');
  } catch {
    fail(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

function getDbProvider(root: string): string {
  const envPath = resolve(root, '.env.local');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/^DB_PROVIDER\s*=\s*"?(\w+)"?/m);
    if (match) return match[1];
  }
  return 'turso';
}

export async function dbPushCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Database Push');
  const provider = getDbProvider(root);
  info(`Provider: ${provider}`);
  run('pnpm db:push', root);
}

export async function dbGenerateCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Generate Migration');
  const provider = getDbProvider(root);
  info(`Provider: ${provider}`);

  if (provider === 'postgres') {
    run('DB_PROVIDER=postgres pnpm db:generate', root);
  } else {
    run('pnpm db:generate', root);
  }
}

export async function dbSeedCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Seed Database');
  run('pnpm db:seed', root);
}

export async function dbStudioCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Drizzle Studio');
  const provider = getDbProvider(root);
  info(`Provider: ${provider}`);
  info('Opening Drizzle Studio in browser...');

  if (provider === 'postgres') {
    run('DB_PROVIDER=postgres npx drizzle-kit studio', root);
  } else {
    run('npx drizzle-kit studio', root);
  }
}

export async function dbStatusCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Database Status');

  const provider = getDbProvider(root);
  info(`Provider: ${provider}`);

  const schemaPath = resolve(root, 'src/lib/db/schema.ts');
  if (existsSync(schemaPath)) {
    const content = readFileSync(schemaPath, 'utf-8');
    const tables = [...content.matchAll(/(?:sqliteTable|pgTable)\(\s*['"](\w+)['"]/g)];
    success(`Schema: ${tables.length} tables defined`);
    for (const t of tables) {
      dim(`  ${t[1]}`);
    }
  } else {
    warn('Schema file not found');
  }

  const migrationsDir = resolve(root, 'src/lib/db/migrations');
  const migrationsPgDir = resolve(root, 'src/lib/db/migrations-pg');

  if (existsSync(migrationsDir)) {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'));
    info(`SQLite migrations: ${files.length}`);
  }

  if (existsSync(migrationsPgDir)) {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(migrationsPgDir).filter((f: string) => f.endsWith('.sql'));
    info(`Postgres migrations: ${files.length}`);
  }

  console.log();
}
