import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { loadProjectEnv, type ProjectEnvOptions } from '../utils/project-env.js';
import { heading, success, fail, info, dim, warn } from '../utils/ui.js';
import { parseDatabaseSchema } from '../utils/schema-parser.js';
import { compareSchemaFiles } from '../utils/schema-parity.js';
import { renderStructuredReport, summarizeChecks } from '../utils/check-report.js';
import { diffSchemaWithLiveDatabase, inspectLiveDatabase } from '../utils/live-db-diff.js';

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

function getDbProvider(root: string, options?: ProjectEnvOptions): 'turso' | 'postgres' {
  const { content } = loadProjectEnv(root, options);
  const match = /^DB_PROVIDER\s*=\s*"?(\w+)"?/m.exec(content);
  if (match?.[1] === 'postgres') return 'postgres';
  return 'turso';
}

export function dbPushCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Database Push');
  const provider = getDbProvider(root, options);
  info(`Provider: ${provider}`);
  run('pnpm db:push', root);
}

export function dbGenerateCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Generate Migration');
  const provider = getDbProvider(root, options);
  info(`Provider: ${provider}`);

  if (provider === 'postgres') {
    run('DB_PROVIDER=postgres pnpm db:generate', root);
  } else {
    run('pnpm db:generate', root);
  }
}

export function dbSeedCommand(_options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Seed Database');
  run('pnpm db:seed', root);
}

export function dbStudioCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Drizzle Studio');
  const provider = getDbProvider(root, options);
  info(`Provider: ${provider}`);
  info('Opening Drizzle Studio in browser...');

  if (provider === 'postgres') {
    run('DB_PROVIDER=postgres npx drizzle-kit studio', root);
  } else {
    run('npx drizzle-kit studio', root);
  }
}

export async function dbStatusCommand(options: ProjectEnvOptions = {}): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Database Status');

  const provider = getDbProvider(root, options);
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

export function dbLiveDiffCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exitCode = 1;
    return;
  }
  const env = loadProjectEnv(root, options);
  const provider = getDbProvider(root, options);
  const schemaPath = provider === 'postgres' ? 'src/lib/db/schema-pg.ts' : 'src/lib/db/schema.ts';
  heading('Live Database Diff');
  info('Read-only: querying database metadata; no DDL or migrations will run.');
  const absoluteSchemaPath = resolve(root, schemaPath);
  if (!existsSync(absoluteSchemaPath)) {
    fail(`Active schema file is missing: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }
  const schema = parseDatabaseSchema(readFileSync(absoluteSchemaPath, 'utf-8'));
  try {
    const differences = diffSchemaWithLiveDatabase(schema, inspectLiveDatabase(root, env.content));
    if (differences.length === 0) success('Live database matches the active schema.');
    else {
      warn(`${differences.length} schema difference(s) found:`);
      for (const difference of differences)
        dim(
          `  ${difference.table}: ${difference.issue} ${JSON.stringify(difference.details ?? '')}`,
        );
      process.exitCode = 1;
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Live database inspection failed.');
    process.exitCode = 1;
  }
}

export function dbSchemaDiffCommand(): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exitCode = 1;
    return;
  }

  const sqlitePath = 'src/lib/db/schema.ts';
  const postgresPath = 'src/lib/db/schema-pg.ts';
  const sqliteAbsolutePath = resolve(root, sqlitePath);
  const postgresAbsolutePath = resolve(root, postgresPath);
  if (!existsSync(sqliteAbsolutePath) || !existsSync(postgresAbsolutePath)) {
    const missing = [
      !existsSync(sqliteAbsolutePath) ? sqlitePath : undefined,
      !existsSync(postgresAbsolutePath) ? postgresPath : undefined,
    ].filter((path): path is string => path !== undefined);
    const report = summarizeChecks([
      {
        id: 'schema-files',
        status: 'fail',
        message: `Schema file(s) missing: ${missing.join(', ')}`,
        path: root,
      },
    ]);
    renderStructuredReport('Schema Parity', report);
    process.exitCode = 1;
    return;
  }

  const report = compareSchemaFiles(
    parseDatabaseSchema(readFileSync(sqliteAbsolutePath, 'utf-8')),
    parseDatabaseSchema(readFileSync(postgresAbsolutePath, 'utf-8')),
  );
  const checks = report.differences.map((difference, index) => ({
    id: `schema-parity-${index + 1}`,
    status: difference.severity,
    message: `${difference.table}: ${difference.issue}${difference.details !== undefined ? ` ${JSON.stringify(difference.details)}` : ''}`,
    path: `${sqlitePath} ↔ ${postgresPath}`,
  }));
  renderStructuredReport(
    'Schema Parity',
    summarizeChecks(
      checks.length > 0
        ? checks
        : [{ id: 'schema-parity', status: 'ok', message: 'SQLite and PostgreSQL schemas match.' }],
    ),
  );
  process.exitCode = report.status === 'fail' ? 1 : 0;
}
