import { resolve } from 'node:path';
import { checkProjectRoot, readJsonFile } from '../utils/project.js';
import { ENV_FILE_NAME, loadProjectEnv, type ProjectEnvOptions } from '../utils/project-env.js';
import {
  getAdapters,
  getAuthMethods,
  getFeatures,
  getOauthProviders,
  FEATURE_ENV,
} from '../utils/env-config.js';
import { heading, success, info, dim, label } from '../utils/ui.js';
import { collectAppConfigSummary } from '../utils/config-report.js';
import { config } from '../utils/config.js';

export function configShowCommand(options: ProjectEnvOptions = {}): void {
  const root = checkProjectRoot('exit');

  heading(`${config.projectName} Configuration`);
  label('Project root', root);

  // --- Package info ---
  const pkg = readJsonFile(resolve(root, 'package.json'));
  if (pkg) {
    label('Package name', typeof pkg.name === 'string' ? pkg.name : 'unknown');
    label('Version', typeof pkg.version === 'string' ? pkg.version : 'unknown');
  }
  console.log();

  const env = loadProjectEnv(root, options);
  const envContent = env.content;

  // --- App config (src/config/app.ts) ---
  const appConfig = collectAppConfigSummary(root);
  if (appConfig) {
    info('Brand');
    const { name, description, logo, favicon } = appConfig.brand;
    if (name) label('  Name', name);
    if (description) label('  Description', description);
    if (logo) label('  Logo', logo);
    if (favicon) label('  Favicon', favicon);
    console.log();

    info('Company');
    const { contactEmail, githubUrl } = appConfig.company;
    if (contactEmail) label('  Contact email', contactEmail);
    if (githubUrl) label('  GitHub', githubUrl);
    console.log();
  } else {
    dim(`src/config/app.ts not found — run \`${config.commandName} setup\``);
  }
  console.log();

  if (env.source === 'file' && !env.fileExists) {
    dim(`${ENV_FILE_NAME} not found — adapters / features / auth methods unavailable`);
    console.log();
    return;
  }

  if (env.source === 'process') {
    dim('Reading adapters / features / auth methods from process.env');
  }

  // --- Adapters (from project env source) ---
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

  // --- Auth methods (from project env source) ---
  info('Auth methods');
  const authMethods = getAuthMethods(envContent);
  label('  Magic Link', authMethods.magicLink ? 'enabled' : 'disabled');
  label('  Passkeys', authMethods.passkeys ? 'enabled' : 'disabled');
  label('  2FA (TOTP)', authMethods.twoFactor ? 'enabled' : 'disabled');
  const oauth = getOauthProviders(envContent);
  label('  OAuth providers', oauth.length > 0 ? oauth.join(', ') : 'none');
  console.log();

  // --- Feature toggles (from project env source + ENABLE_* defaults) ---
  info('Features');
  const features = getFeatures(envContent);
  const featureKeys = Object.keys(FEATURE_ENV);
  const enabled = featureKeys.filter((k) => features[k]);
  const disabled = featureKeys.filter((k) => !features[k]);
  for (const f of enabled) success(f);
  for (const f of disabled) dim(`  ○ ${f}`);
  console.log();
}
