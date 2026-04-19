import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot, readJsonFile } from '../utils/project.js';
import {
  getAdapters,
  getAuthMethods,
  getFeatures,
  getOauthProviders,
  FEATURE_ENV,
} from '../utils/env-config.js';
import { heading, success, fail, info, dim, label } from '../utils/ui.js';

/** Extracts a quoted string from a TS object literal: `field: 'value'` or `field: "value"`. */
function extractTsObjectField(content: string, field: string): string | null {
  const regex = new RegExp(`\\b${field}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
  const match = regex.exec(content);
  return match?.[1] ?? null;
}

/** Extracts a numeric literal: `field: 123` or `field: 0.5`. */
function extractTsNumericField(content: string, field: string): string | null {
  const regex = new RegExp(`\\b${field}\\s*:\\s*([\\d.]+)`);
  const match = regex.exec(content);
  return match?.[1] ?? null;
}

/** Extracts a boolean literal: `field: true|false`. */
function extractTsBoolField(content: string, field: string): boolean | null {
  const regex = new RegExp(`\\b${field}\\s*:\\s*(true|false)`);
  const match = regex.exec(content);
  return match ? match[1] === 'true' : null;
}

export function configShowCommand(): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Codapult Configuration');
  label('Project root', root);

  // --- Package info ---
  const pkg = readJsonFile(resolve(root, 'package.json'));
  if (pkg) {
    label('Package name', typeof pkg.name === 'string' ? pkg.name : 'unknown');
    label('Version', typeof pkg.version === 'string' ? pkg.version : 'unknown');
  }
  console.log();

  const envPath = resolve(root, '.env.local');
  const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  // --- App config (src/config/app.ts) ---
  const appConfigPath = resolve(root, 'src/config/app.ts');
  if (existsSync(appConfigPath)) {
    const content = readFileSync(appConfigPath, 'utf-8');

    info('Brand');
    const name = extractTsObjectField(content, 'name');
    const description = extractTsObjectField(content, 'description');
    const logo = extractTsObjectField(content, 'logo');
    const favicon = extractTsObjectField(content, 'favicon');
    if (name) label('  Name', name);
    if (description) label('  Description', description);
    if (logo) label('  Logo', logo);
    if (favicon) label('  Favicon', favicon);
    console.log();

    info('Company');
    const contactEmail = extractTsObjectField(content, 'contactEmail');
    const githubUrl = extractTsObjectField(content, 'githubUrl');
    if (contactEmail) label('  Contact email', contactEmail);
    if (githubUrl) label('  GitHub', githubUrl);
    console.log();

    info('AI');
    const defaultModel = extractTsObjectField(content, 'defaultModel');
    const ragEnabled = extractTsBoolField(content, 'ragEnabled');
    const ragMaxChunks = extractTsNumericField(content, 'ragMaxChunks');
    const ragMinScore = extractTsNumericField(content, 'ragMinScore');
    if (defaultModel) label('  Default model', defaultModel);
    if (ragEnabled !== null) label('  RAG', ragEnabled ? 'enabled' : 'disabled');
    if (ragMaxChunks) label('  RAG max chunks', ragMaxChunks);
    if (ragMinScore) label('  RAG min score', ragMinScore);
  } else {
    dim('src/config/app.ts not found — run `codapult setup`');
  }
  console.log();

  if (!existsSync(envPath)) {
    dim('.env.local not found — adapters / features / auth methods unavailable');
    console.log();
    return;
  }

  // --- Adapters (from .env.local) ---
  info('Adapters');
  const adapters = getAdapters(envContent);
  label('  Database', adapters.database);
  label('  Auth', adapters.auth);
  label('  Payments', adapters.payments);
  label('  Storage', adapters.storage);
  label('  Background jobs', adapters.jobs);
  label('  Notifications', adapters.notifications);
  label('  Embedding', adapters.embedding);
  label('  Vector store', adapters.vectorStore);
  console.log();

  // --- Auth methods (from .env.local) ---
  info('Auth methods');
  const authMethods = getAuthMethods(envContent);
  label('  Magic Link', authMethods.magicLink ? 'enabled' : 'disabled');
  label('  Passkeys', authMethods.passkeys ? 'enabled' : 'disabled');
  label('  2FA (TOTP)', authMethods.twoFactor ? 'enabled' : 'disabled');
  const oauth = getOauthProviders(envContent);
  label('  OAuth providers', oauth.length > 0 ? oauth.join(', ') : 'none');
  console.log();

  // --- Feature toggles (from .env.local + ENABLE_* defaults) ---
  info('Features');
  const features = getFeatures(envContent);
  const featureKeys = Object.keys(FEATURE_ENV);
  const enabled = featureKeys.filter((k) => features[k]);
  const disabled = featureKeys.filter((k) => !features[k]);
  for (const f of enabled) success(f);
  for (const f of disabled) dim(`  ○ ${f}`);
  console.log();
}
