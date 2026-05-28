import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createInterface } from 'node:readline';
import { findProjectRoot } from '../utils/project.js';
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  type ProjectEnvOptions,
} from '../utils/project-env.js';
import { heading, success, fail, info, dim } from '../utils/ui.js';

const rl = (): ReturnType<typeof createInterface> =>
  createInterface({ input: process.stdin, output: process.stdout });

function ask(
  iface: ReturnType<typeof rl>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((res) => {
    iface.question(`  ${question}${suffix}: `, (answer) => {
      res(answer.trim() || defaultValue || '');
    });
  });
}

async function confirmPrompt(
  iface: ReturnType<typeof rl>,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(iface, `${question} [${hint}]`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function selectPrompt(
  iface: ReturnType<typeof rl>,
  question: string,
  options: string[],
): Promise<string> {
  console.log(`\n  ${question}`);
  options.forEach((opt, i) => console.log(`    ${i + 1}. ${opt}`));
  const answer = await ask(iface, 'Choose', '1');
  const idx = parseInt(answer, 10) - 1;
  return options[Math.max(0, Math.min(idx, options.length - 1))];
}

interface ProjectConfig {
  appName: string;
  appUrl: string;
  authProvider: 'better-auth' | 'kinde' | 'none';
  paymentProvider: 'stripe' | 'lemonsqueezy';
  storageProvider: 'local' | 's3';
  jobProvider: 'memory' | 'bullmq';
  enableAuth: boolean;
  enableAI: boolean;
  enableBlog: boolean;
  enableTeams: boolean;
  enableWaitlist: boolean;
  enableGraphQL: boolean;
  enableSSO: boolean;
  enableApiDocs: boolean;
  enableHelpCenter: boolean;
  enableExperiments: boolean;
  enableFeatureRequests: boolean;
  enableCompare: boolean;
  enableConnect: boolean;
  enableEventStore: boolean;
  enableOtel: boolean;
  enableDripCampaigns: boolean;
  enableOnboarding: boolean;
  enableWorkflows: boolean;
  enableReferrals: boolean;
  enableAnalytics: boolean;
  enableChangelog: boolean;
  enableRAG: boolean;
  enableWebhooks: boolean;
  enableAuditLog: boolean;
  enableReports: boolean;
  enableBranding: boolean;
  enableTwoFactor: boolean;
  enablePlugins: boolean;
}

// ---------------------------------------------------------------------------
// Built-in presets for non-interactive (CI/CD) setup via --preset flag.
// ---------------------------------------------------------------------------

const BUILT_IN_PRESETS: Record<string, Partial<ProjectConfig>> = {
  // Showcase / marketing-only site: navbar shows only Pricing, Plugins, Docs.
  // `enableHelpCenter` stays true (powers /docs).
  marketing: {
    authProvider: 'none',
    enableAuth: false,
    enableAI: false,
    enableTeams: false,
    enableConnect: false,
    enableSSO: false,
    enableOnboarding: false,
    enableWorkflows: false,
    enableReferrals: false,
    enableAnalytics: false,
    enableExperiments: false,
    enableRAG: false,
    enableEventStore: false,
    enableOtel: false,
    enableDripCampaigns: false,
    enableApiDocs: false,
    enableChangelog: false,
    enableBlog: true,
    enableWaitlist: false,
    enableFeatureRequests: false,
    enableCompare: true,
    enableWebhooks: false,
    enableAuditLog: false,
    enableReports: false,
    enableBranding: false,
    enableTwoFactor: false,
    // Plugins page stays in marketing navbar by default — preset keeps the
    // feature on. Override with `marketing;enablePlugins=false` to drop it.
  },
  demo: {
    authProvider: 'better-auth',
  },
};

const DEFAULT_CONFIG: ProjectConfig = {
  appName: 'Codapult',
  appUrl: 'http://localhost:3000',
  authProvider: 'better-auth',
  paymentProvider: 'stripe',
  storageProvider: 'local',
  jobProvider: 'memory',
  enableAuth: true,
  enableAI: true,
  enableBlog: true,
  enableTeams: true,
  enableWaitlist: true,
  enableGraphQL: true,
  enableSSO: true,
  enableApiDocs: true,
  enableHelpCenter: true,
  enableExperiments: true,
  enableFeatureRequests: true,
  enableCompare: false,
  enableConnect: true,
  enableEventStore: true,
  enableOtel: true,
  enableDripCampaigns: true,
  enableOnboarding: true,
  enableWorkflows: true,
  enableReferrals: true,
  enableAnalytics: true,
  enableChangelog: true,
  enableRAG: true,
  enableWebhooks: true,
  enableAuditLog: true,
  enableReports: true,
  enableBranding: true,
  enableTwoFactor: true,
  enablePlugins: true,
};

function parsePresetValue(raw: string): Partial<ProjectConfig> {
  const parts = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const result: Record<string, unknown> = {};

  if (parts.length === 1 && !parts[0].includes('=')) {
    const name = parts[0];
    if (!(name in BUILT_IN_PRESETS)) {
      fail(`Unknown preset: "${name}". Available: ${Object.keys(BUILT_IN_PRESETS).join(', ')}`);
      process.exit(1);
    }
    return BUILT_IN_PRESETS[name];
  }

  let base: Partial<ProjectConfig> = {};
  for (const part of parts) {
    if (!part.includes('=')) {
      if (part in BUILT_IN_PRESETS) {
        base = { ...base, ...BUILT_IN_PRESETS[part] };
        continue;
      }
      fail(`Unknown preset or invalid key=value pair: "${part}"`);
      process.exit(1);
    }
    const eqIdx = part.indexOf('=');
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    result[key] = val === 'false' ? false : val === 'true' ? true : val;
  }

  return { ...base, ...result };
}

function resolvePreset(raw: string): ProjectConfig {
  const overrides = parsePresetValue(raw);
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (config.authProvider === 'none') {
    config.enableAuth = false;
  }

  return config;
}

// All app-router paths are under `src/app/[locale]/...` (next-intl).
// API routes (`src/app/api/...`) and `src/lib`/`src/components` paths
// are NOT under [locale].
const APP = 'src/app/[locale]';

const MODULE_REMOVALS: {
  key: keyof ProjectConfig;
  paths: string[];
  label: string;
}[] = [
  {
    key: 'enableAuth',
    paths: [
      `${APP}/(auth)`,
      `${APP}/(dashboard)`,
      `${APP}/admin`,
      `${APP}/invite`,
      'src/app/api/auth',
      'src/lib/auth/better-auth.ts',
      'src/lib/auth/better-auth.test.ts',
      'src/lib/auth/kinde.ts',
      'src/lib/auth/kinde.test.ts',
      'src/lib/auth/better-auth-client.ts',
      'src/lib/auth/kinde-client.ts',
      'src/lib/auth/client-adapter.test.ts',
      'src/components/auth/AuthForm.tsx',
      'src/components/auth/AuthFormSkeleton.tsx',
      'src/components/dashboard',
      'src/components/admin',
      'src/app/api/admin',
      'src/lib/actions/admin.ts',
      'src/lib/actions/admin.test.ts',
      'src/lib/actions/impersonation.ts',
      'src/lib/actions/impersonation.test.ts',
      'src/components/ImpersonationBanner.tsx',
    ],
    label: 'Authentication & Dashboard',
  },
  {
    key: 'enableAI',
    paths: [`${APP}/(dashboard)/dashboard/ai-chat`, 'src/app/api/chat', 'src/components/ai'],
    label: 'AI Chat',
  },
  {
    key: 'enableBlog',
    paths: [
      `${APP}/(marketing)/blog`,
      'src/components/blog',
      'src/components/seo/BlogPostJsonLd.tsx',
      'src/lib/blog',
      'src/lib/rss.ts',
      'src/lib/rss.test.ts',
      'content/blog',
      'src/app/rss.xml',
      'src/app/[locale]/rss.xml',
    ],
    label: 'Blog',
  },
  {
    key: 'enableTeams',
    paths: [
      `${APP}/(dashboard)/dashboard/teams`,
      `${APP}/invite`,
      'src/components/dashboard/TeamSwitcher.tsx',
      'src/components/dashboard/TeamSettings.tsx',
      'src/components/dashboard/AcceptInvitationButton.tsx',
      'src/lib/db/organizations.ts',
      'src/lib/actions/organizations.ts',
      'src/lib/actions/organizations.test.ts',
      'src/lib/payments/seats.ts',
      'src/lib/payments/seats.test.ts',
      'src/lib/guards.ts',
      'src/lib/guards.test.ts',
      'src/app/api/scim',
    ],
    label: 'Teams',
  },
  {
    key: 'enableWaitlist',
    paths: [
      `${APP}/(marketing)/waitlist`,
      `${APP}/admin/waitlist`,
      'src/components/marketing/WaitlistForm.tsx',
      'src/lib/actions/waitlist.ts',
    ],
    label: 'Waitlist',
  },
  {
    key: 'enableGraphQL',
    paths: ['src/lib/graphql', 'src/app/api/graphql'],
    label: 'GraphQL API',
  },
  {
    key: 'enableSSO',
    paths: [
      `${APP}/admin/sso`,
      'src/lib/sso',
      'src/app/api/auth/sso',
      'src/app/api/admin/sso',
      'src/components/admin/SSOManager.tsx',
    ],
    label: 'Enterprise SSO',
  },
  {
    key: 'enableApiDocs',
    paths: [
      `${APP}/(marketing)/docs/api`,
      'src/lib/api-docs.ts',
      'src/lib/openapi.ts',
      'src/app/api/openapi',
      'src/components/docs/ApiReference.tsx',
    ],
    label: 'API Docs',
  },
  {
    key: 'enableHelpCenter',
    paths: [
      `${APP}/(marketing)/docs`,
      'src/lib/docs',
      'src/components/docs/HelpDocSearch.tsx',
      'content/docs',
    ],
    label: 'Documentation',
  },
  {
    key: 'enableChangelog',
    paths: [
      `${APP}/(marketing)/changelog`,
      'src/app/api/changelog',
      'src/components/dashboard/ChangelogWidget.tsx',
    ],
    label: 'Changelog',
  },
  {
    key: 'enableExperiments',
    paths: [
      `${APP}/admin/experiments`,
      'src/lib/experiments',
      'src/app/api/admin/experiments',
      'src/components/admin/ExperimentManager.tsx',
    ],
    label: 'A/B Testing',
  },
  {
    key: 'enableFeatureRequests',
    paths: [
      `${APP}/(marketing)/feature-requests`,
      'src/lib/feature-requests',
      'src/app/api/feature-requests',
      'src/components/feature-requests',
    ],
    label: 'Feature Requests',
  },
  {
    key: 'enableCompare',
    paths: [
      `${APP}/(marketing)/compare`,
      `${APP}/(marketing)/vs`,
      'src/config/competitor-comparison.ts',
      'src/components/marketing/ComparisonTable.tsx',
    ],
    label: 'Compare',
  },
  {
    key: 'enableConnect',
    paths: [
      `${APP}/(dashboard)/dashboard/connect`,
      'src/lib/payments/connect.ts',
      'src/app/api/connect',
      'src/components/dashboard/ConnectDashboard.tsx',
    ],
    label: 'Stripe Connect',
  },
  {
    key: 'enableEventStore',
    paths: ['src/lib/event-store', 'src/app/api/admin/events'],
    label: 'Event Store',
  },
  { key: 'enableOtel', paths: ['src/lib/telemetry'], label: 'OpenTelemetry' },
  {
    key: 'enableDripCampaigns',
    paths: [
      `${APP}/admin/drip-campaigns`,
      'src/lib/drip-campaigns',
      'src/app/api/admin/drip-campaigns',
      'src/components/admin/DripCampaignManager.tsx',
    ],
    label: 'Drip Campaigns',
  },
  {
    key: 'enableOnboarding',
    paths: [
      `${APP}/(dashboard)/dashboard/onboarding`,
      'src/lib/onboarding',
      'src/app/api/onboarding',
      'src/components/dashboard/OnboardingTour.tsx',
      'src/components/dashboard/OnboardingForm.tsx',
    ],
    label: 'Onboarding Tours',
  },
  {
    key: 'enableWorkflows',
    paths: [
      `${APP}/(dashboard)/dashboard/workflows`,
      'src/lib/workflows',
      'src/app/api/workflows',
      'src/components/dashboard/WorkflowBuilder.tsx',
    ],
    label: 'Workflow Automation',
  },
  {
    key: 'enableReferrals',
    paths: [
      `${APP}/(dashboard)/dashboard/referrals`,
      'src/lib/referrals',
      'src/app/api/referrals',
      'src/components/dashboard/ReferralDashboard.tsx',
    ],
    label: 'Referral Program',
  },
  {
    key: 'enableAnalytics',
    paths: [
      `${APP}/(dashboard)/dashboard/analytics`,
      'src/lib/analytics',
      'src/app/api/analytics',
      'src/components/dashboard/AnalyticsDashboard.tsx',
    ],
    label: 'Built-in Analytics',
  },
  {
    key: 'enableRAG',
    paths: [
      'src/lib/ai/chunker.ts',
      'src/lib/ai/embeddings.ts',
      'src/lib/ai/vector-store.ts',
      'src/lib/ai/rag.ts',
      'src/app/api/ai',
    ],
    label: 'RAG Pipeline',
  },
  {
    key: 'enableWebhooks',
    paths: [
      `${APP}/(dashboard)/dashboard/webhooks`,
      `${APP}/admin/webhooks`,
      'src/app/api/webhooks',
      'src/lib/outgoing-webhooks',
      'src/lib/webhook-log.ts',
      'src/lib/webhook-log.test.ts',
      'src/components/dashboard/OutgoingWebhooks.tsx',
    ],
    label: 'Outgoing Webhooks',
  },
  {
    key: 'enableAuditLog',
    paths: [
      `${APP}/(dashboard)/dashboard/audit-log`,
      `${APP}/admin/activity`,
      'src/app/api/audit-log',
      'src/lib/activity-log.ts',
      'src/components/dashboard/AuditLog.tsx',
    ],
    label: 'Audit Log',
  },
  {
    key: 'enableReports',
    paths: [
      `${APP}/(dashboard)/dashboard/reports`,
      'src/app/api/reports',
      'src/lib/scheduled-reports',
      'src/components/dashboard/ReportSchedules.tsx',
    ],
    label: 'Scheduled Reports',
  },
  {
    key: 'enableBranding',
    paths: [
      `${APP}/(dashboard)/dashboard/branding`,
      'src/app/api/branding',
      'src/lib/white-label',
      'src/components/dashboard/BrandingSettings.tsx',
      'src/components/dashboard/BrandingProvider.tsx',
    ],
    label: 'White-label Branding',
  },
  {
    key: 'enableTwoFactor',
    // 2FA is implemented as a Better Auth plugin — only the UI control needs
    // to be removed; auth route handlers stay since the plugin is loaded at
    // runtime when ENABLE_TWO_FACTOR is set.
    paths: ['src/components/dashboard/TwoFactorSettings.tsx'],
    label: 'Two-factor Authentication (UI)',
  },
  {
    key: 'enablePlugins',
    paths: [
      `${APP}/(marketing)/plugins`,
      `${APP}/(dashboard)/dashboard/plugins`,
      'src/app/api/plugins',
      'src/lib/plugins',
      'src/components/marketing/PluginsShowcase.tsx',
      'src/components/marketing/PluginDetail.tsx',
      'src/components/dashboard/PluginMarketplace.tsx',
    ],
    label: 'Plugin Marketplace',
  },
];

// Maps CLI enable* flags → server-side ENABLE_* env var names.
// Only flags that actually toggle runtime behavior via env.features belong here;
// everything else is removed from disk by `removeModules`.
//
// Install-time-only features (no runtime ENABLE_* — file removal only):
//   enableGraphQL, enableEventStore, enableOtel, enableRAG, enableConnect.
// These are infrastructure-flavoured and either always-on or only meaningful
// at build-time, so they don't expose a user-facing env toggle.
const FEATURE_ENV_VARS: Partial<Record<keyof ProjectConfig, string>> = {
  enableApiDocs: 'ENABLE_API_DOCS',
  enableHelpCenter: 'ENABLE_HELP_CENTER',
  enableChangelog: 'ENABLE_CHANGELOG',
  enableBlog: 'ENABLE_BLOG',
  enableWaitlist: 'ENABLE_WAITLIST',
  enableFeatureRequests: 'ENABLE_FEATURE_REQUESTS',
  enableCompare: 'ENABLE_COMPARE',
  enableAI: 'ENABLE_AI_CHAT',
  enableTeams: 'ENABLE_TEAMS',
  enableReferrals: 'ENABLE_REFERRALS',
  enableAnalytics: 'ENABLE_ANALYTICS',
  enableWorkflows: 'ENABLE_WORKFLOWS',
  enableSSO: 'ENABLE_SSO',
  enableExperiments: 'ENABLE_EXPERIMENTS',
  enableDripCampaigns: 'ENABLE_DRIP_CAMPAIGNS',
  enableOnboarding: 'ENABLE_ONBOARDING',
  enableWebhooks: 'ENABLE_WEBHOOKS',
  enableAuditLog: 'ENABLE_AUDIT_LOG',
  enableReports: 'ENABLE_REPORTS',
  enableBranding: 'ENABLE_BRANDING',
  enableTwoFactor: 'ENABLE_TWO_FACTOR',
  enablePlugins: 'ENABLE_PLUGINS',
};

const PRUNE_MARKER_FILES = [
  'src/app/sitemap.ts',
  'src/app/sitemap.test.ts',
  'src/lib/auth/index.ts',
  'src/lib/auth/client-adapter.ts',
  'src/lib/jobs/definitions.ts',
  'src/config/marketing.test.ts',
  'src/instrumentation.ts',
] as const;

function generateEnvFile(root: string, config: ProjectConfig): void {
  const envExamplePath = join(root, ENV_EXAMPLE_FILE_NAME);
  const envLocalPath = join(root, ENV_FILE_NAME);

  if (existsSync(envLocalPath)) {
    info(`${ENV_FILE_NAME} already exists — creating ${ENV_FILE_NAME}.new instead`);
  }

  let content = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';

  const replacements: Record<string, string> = {
    NEXT_PUBLIC_APP_NAME: config.appName,
    NEXT_PUBLIC_APP_URL: config.appUrl,
    AUTH_PROVIDER: config.authProvider,
    PAYMENT_PROVIDER: config.paymentProvider,
    STORAGE_PROVIDER: config.storageProvider,
    JOB_PROVIDER: config.jobProvider,
    ...(config.enableAnalytics ? { NEXT_PUBLIC_ANALYTICS_ENABLED: 'true' } : {}),
  };

  for (const [cliKey, envVar] of Object.entries(FEATURE_ENV_VARS)) {
    if (config[cliKey as keyof ProjectConfig] === false) {
      replacements[envVar] = 'false';
    }
  }

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  const outputPath = existsSync(envLocalPath) ? `${envLocalPath}.new` : envLocalPath;
  writeFileSync(outputPath, content, 'utf-8');
  success(`Written to ${relative(root, outputPath)}`);
}

function printProcessEnvNextSteps(): void {
  info('Next steps:');
  dim('1. Configure required env vars in your shell, CI, or Vercel dashboard');
  dim('2. pnpm install');
  dim('3. Run Codapult commands from a process where those env vars are available');
  dim('4. pnpm dev');
}

function generateMcpConfig(root: string): void {
  const cursorDir = join(root, '.cursor');
  const mcpPath = join(cursorDir, 'mcp.json');

  if (existsSync(mcpPath)) {
    dim('.cursor/mcp.json already exists — skipping');
    return;
  }

  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true });
  }

  const config = {
    mcpServers: {
      codapult: {
        command: 'node',
        args: ['../codapult-cli/dist/index.js', 'mcp-server'],
        cwd: '.',
      },
    },
  };

  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  success('Created .cursor/mcp.json — Codapult MCP server configured for Cursor');
}

function pruneMarkedBlocks(
  content: string,
  disabledKeys: readonly (keyof ProjectConfig)[],
): string {
  let next = content;

  for (const key of disabledKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^[ \\t]*\\/\\/\\s*codapult:prune:start\\s+${escapedKey}\\s*\\n[\\s\\S]*?^[ \\t]*\\/\\/\\s*codapult:prune:end\\s+${escapedKey}[ \\t]*\\n?`,
      'gm',
    );

    next = next.replace(pattern, '');
  }

  return next;
  // return next.replace(/\n{3,}/g, '\n\n');
}

function pruneMarkedBlocksInFiles(root: string, config: ProjectConfig): void {
  const disabledKeys = (Object.keys(config) as (keyof ProjectConfig)[]).filter(
    (key) => key.startsWith('enable') && config[key] === false,
  );

  if (disabledKeys.length === 0) return;

  dim(`Pruning files...`);

  for (const relativePath of PRUNE_MARKER_FILES) {
    const fullPath = resolve(root, relativePath);
    if (!existsSync(fullPath)) continue;

    const original = readFileSync(fullPath, 'utf-8');
    const pruned = pruneMarkedBlocks(original, disabledKeys);

    if (pruned !== original) {
      writeFileSync(fullPath, pruned, 'utf-8');
      dim(`  patched ${relativePath}`);
    }
  }
}

function removeModules(root: string, config: ProjectConfig): void {
  for (const removal of MODULE_REMOVALS) {
    if (config[removal.key]) continue;

    dim(`Removing ${removal.label}...`);
    let removed = 0;
    const missing: string[] = [];
    for (const p of removal.paths) {
      const fullPath = resolve(root, p);
      if (existsSync(fullPath)) {
        rmSync(fullPath, { recursive: true });
        dim(`  deleted ${p}`);
        removed += 1;
      } else {
        missing.push(p);
      }
    }
    // Surface stale paths so removals don't silently no-op when the host
    // project's file layout changes (e.g. moving routes under [locale]).
    if (removed === 0 && missing.length > 0) {
      dim(`  no matching files found (expected ${missing.length} path(s))`);
    }
  }

  pruneMarkedBlocksInFiles(root, config);
}

async function interactiveSetup(): Promise<ProjectConfig> {
  const iface = rl();

  heading('Codapult Setup');
  info('This wizard will configure your project.\n');

  const authProvider = (await selectPrompt(iface, 'Auth provider:', [
    'better-auth',
    'kinde',
    'none',
  ])) as ProjectConfig['authProvider'];

  const authEnabled = authProvider !== 'none';

  const config: ProjectConfig = {
    appName: await ask(iface, 'App name', 'Codapult'),
    appUrl: await ask(iface, 'App URL', 'http://localhost:3000'),
    authProvider,
    paymentProvider: (await selectPrompt(iface, 'Payment provider:', [
      'stripe',
      'lemonsqueezy',
    ])) as ProjectConfig['paymentProvider'],
    storageProvider: (await selectPrompt(iface, 'Storage provider:', [
      'local',
      's3',
    ])) as ProjectConfig['storageProvider'],
    jobProvider: (await selectPrompt(iface, 'Background jobs:', [
      'memory',
      'bullmq',
    ])) as ProjectConfig['jobProvider'],
    enableAuth: authEnabled,
    enableAI: await confirmPrompt(iface, 'Enable AI Chat module?'),
    enableBlog: await confirmPrompt(iface, 'Enable Blog module?'),
    enableTeams: authEnabled && (await confirmPrompt(iface, 'Enable Teams/Organizations?')),
    enableWaitlist: await confirmPrompt(iface, 'Enable Waitlist page?'),
    enableGraphQL: await confirmPrompt(iface, 'Enable GraphQL API layer?'),
    enableSSO: authEnabled && (await confirmPrompt(iface, 'Enable Enterprise SSO (SAML)?')),
    enableApiDocs: await confirmPrompt(iface, 'Enable interactive API docs?'),
    enableHelpCenter: await confirmPrompt(iface, 'Enable Documentation module?'),
    enableExperiments: await confirmPrompt(iface, 'Enable A/B Testing?'),
    enableFeatureRequests: await confirmPrompt(iface, 'Enable Feature Request board?'),
    enableCompare: false,
    enableConnect:
      authEnabled && (await confirmPrompt(iface, 'Enable Stripe Connect (marketplace)?')),
    enableEventStore: await confirmPrompt(iface, 'Enable Event Store (event sourcing)?'),
    enableOtel: await confirmPrompt(iface, 'Enable OpenTelemetry tracing?'),
    enableDripCampaigns: await confirmPrompt(iface, 'Enable email drip campaigns?'),
    enableOnboarding:
      authEnabled && (await confirmPrompt(iface, 'Enable in-app onboarding tours?')),
    enableWorkflows: authEnabled && (await confirmPrompt(iface, 'Enable workflow automation?')),
    enableReferrals: authEnabled && (await confirmPrompt(iface, 'Enable referral program?')),
    enableAnalytics: await confirmPrompt(iface, 'Enable built-in analytics?'),
    enableChangelog: await confirmPrompt(iface, 'Enable Changelog page?'),
    enableRAG: await confirmPrompt(iface, 'Enable RAG pipeline (vector search)?'),
    enableWebhooks: authEnabled && (await confirmPrompt(iface, 'Enable outgoing webhooks?')),
    enableAuditLog:
      authEnabled && (await confirmPrompt(iface, 'Enable audit log / activity feed?')),
    enableReports: authEnabled && (await confirmPrompt(iface, 'Enable scheduled email reports?')),
    enableBranding:
      authEnabled && (await confirmPrompt(iface, 'Enable per-org branding (white-label)?')),
    enableTwoFactor:
      authEnabled && (await confirmPrompt(iface, 'Enable two-factor authentication (TOTP)?')),
    enablePlugins: await confirmPrompt(iface, 'Enable plugin marketplace (/plugins)?'),
  };

  if (await confirmPrompt(iface, 'Remove unused module code?', false)) {
    return config;
  }

  iface.close();
  return config;
}

interface SetupOptions extends Pick<ProjectEnvOptions, 'envFile'> {
  preset?: string;
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project. Run this from your project directory.');
    process.exit(1);
  }

  const presetRaw = options.preset;

  let config: ProjectConfig;

  if (presetRaw) {
    heading('Codapult Setup (preset mode)');
    info(`Applying preset: ${presetRaw}\n`);
    config = resolvePreset(presetRaw);
  } else {
    config = await interactiveSetup();
  }

  heading('Generating configuration');
  if (options.envFile === false) {
    dim(`Skipped ${ENV_FILE_NAME} generation`);
  } else {
    generateEnvFile(root, config);
  }

  heading('Removing unused modules');
  removeModules(root, config);

  heading('Setting up MCP integration');
  generateMcpConfig(root);

  heading('Done!');
  if (presetRaw) {
    info('Preset applied. Proceeding to build.');
  } else {
    if (options.envFile === false) {
      printProcessEnvNextSteps();
    } else {
      info('Next steps:');
      dim(`1. Fill in secrets in ${ENV_FILE_NAME}`);
      dim('2. pnpm install');
      dim('3. pnpm db:push');
      dim('4. pnpm dev');
    }
  }
  console.log();
}
