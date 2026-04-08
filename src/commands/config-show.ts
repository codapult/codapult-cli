import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot, readJsonFile } from '../utils/project.js';
import { heading, success, fail, info, dim, label } from '../utils/ui.js';

function extractTsObjectField(content: string, field: string): string | null {
  const regex = new RegExp(`${field}:\\s*['"\`]([^'"\`]+)['"\`]`);
  const match = content.match(regex);
  return match?.[1] ?? null;
}

function extractTsBooleanFields(content: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const regex = /(\w+):\s*(true|false)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    result[match[1]] = match[2] === 'true';
  }
  return result;
}

function extractEnvValue(envContent: string, key: string): string | null {
  const regex = new RegExp(`^${key}=(.*)$`, 'm');
  const match = envContent.match(regex);
  return match?.[1]?.trim() ?? null;
}

export async function configShowCommand(): Promise<void> {
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
    label('Package name', String(pkg.name ?? 'unknown'));
    label('Version', String(pkg.version ?? 'unknown'));
  }
  console.log();

  // --- App config (src/config/app.ts) ---
  const appConfigPath = resolve(root, 'src/config/app.ts');
  if (existsSync(appConfigPath)) {
    const content = readFileSync(appConfigPath, 'utf-8');

    info('Brand');
    const name = extractTsObjectField(content, 'name');
    const description = extractTsObjectField(content, 'description');
    const url = extractTsObjectField(content, 'url');
    const supportEmail = extractTsObjectField(content, 'supportEmail');

    if (name) label('  Name', name);
    if (description) label('  Description', description);
    if (url) label('  URL', url);
    if (supportEmail) label('  Support email', supportEmail);
    console.log();

    info('Features');
    const features = extractTsBooleanFields(content);
    const featureKeys = Object.keys(features).filter(
      (k) => !['magicLink', 'passkeys', 'twoFactor'].includes(k),
    );
    const enabled = featureKeys.filter((k) => features[k]);
    const disabled = featureKeys.filter((k) => !features[k]);

    if (enabled.length > 0) {
      for (const f of enabled) success(f);
    }
    if (disabled.length > 0) {
      for (const f of disabled) dim(`  ○ ${f}`);
    }
    console.log();

    info('Auth');
    const magicLink = features.magicLink;
    const passkeys = features.passkeys;
    const twoFactor = features.twoFactor;
    if (magicLink !== undefined) label('  Magic Link', magicLink ? 'enabled' : 'disabled');
    if (passkeys !== undefined) label('  Passkeys', passkeys ? 'enabled' : 'disabled');
    if (twoFactor !== undefined) label('  2FA (TOTP)', twoFactor ? 'enabled' : 'disabled');

    const oauthMatch = content.match(/oauthProviders:\s*\[([^\]]*)\]/);
    if (oauthMatch) {
      const providers = oauthMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
      label('  OAuth providers', providers.join(', ') || 'none');
    }
  } else {
    dim('src/config/app.ts not found — run `codapult setup`');
  }
  console.log();

  // --- Adapters from .env.local ---
  info('Adapters');
  const envPath = resolve(root, '.env.local');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const adapters = [
      ['AUTH_PROVIDER', 'Auth'],
      ['PAYMENT_PROVIDER', 'Payments'],
      ['STORAGE_PROVIDER', 'Storage'],
      ['NOTIFICATION_TRANSPORT', 'Notifications'],
      ['JOB_PROVIDER', 'Background jobs'],
    ] as const;

    for (const [key, name] of adapters) {
      const value = extractEnvValue(envContent, key);
      label(`  ${name}`, value ?? 'not set');
    }
  } else {
    dim('.env.local not found');
  }
  console.log();
}
