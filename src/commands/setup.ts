import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createInterface } from 'node:readline';
import { findProjectRoot } from '../utils/project.js';
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  type ProjectEnvOptions,
} from '../utils/project-env.js';
import { heading, success, fail, info, dim, ask, confirm } from '../utils/ui.js';

async function selectPrompt<T extends string>(
  iface: ReturnType<typeof createInterface>,
  question: string,
  options: T[],
): Promise<T> {
  console.log(`\n  ${question}`);
  options.forEach((opt, i) => console.log(`    ${i + 1}. ${opt}`));
  const answer = await ask(iface, 'Choose', '1');
  const idx = parseInt(answer, 10) - 1;
  return options[Math.max(0, Math.min(idx, options.length - 1))];
}

function emptyLine(): boolean {
  console.log();
  return true;
}

interface ProjectConfig {
  appName: string;
  appUrl: string;
  authProvider: 'better-auth' | 'kinde' | 'none';
  paymentProvider: 'stripe' | 'lemonsqueezy' | 'polar';
  ssoProvider: 'jackson' | 'none';
  storageProvider: 'local' | 's3';
  jobProvider: 'memory' | 'bullmq' | 'none';
  enableAuth: boolean;
  enableAI: boolean;
  enableRAG: boolean;
  enableAgents: boolean;
  enableBatch: boolean;
  enablePlayground: boolean;
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
  enableWebhooks: boolean;
  enableAuditLog: boolean;
  enableReports: boolean;
  enableBranding: boolean;
  enableTwoFactor: boolean;
  enablePlugins: boolean;
  removeUnusedCode: boolean;
}

// ---------------------------------------------------------------------------
// Built-in presets for non-interactive (CI/CD) setup via --preset flag.
// ---------------------------------------------------------------------------

const BUILT_IN_PRESETS: Record<string, Partial<ProjectConfig>> = {
  // Marketing-only site.
  marketing: {
    authProvider: 'none',
    jobProvider: 'none',
    ssoProvider: 'none',
    enableAuth: false,
    enableAI: false,
    enableAgents: false,
    enableBatch: false,
    enablePlayground: false,
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
    enableWaitlist: false,
    enableFeatureRequests: false,
    enableWebhooks: false,
    enableAuditLog: false,
    enableReports: false,
    enableBranding: false,
    enableTwoFactor: false,
    enableGraphQL: false,
    enableHelpCenter: true,
    enableBlog: true,
    enablePlugins: true,
    enableCompare: true,
    removeUnusedCode: true,
  },
  demo: {
    authProvider: 'better-auth',
  },
};

const DEFAULT_CONFIG: ProjectConfig = {
  appName: 'Codapult',
  appUrl: 'http://localhost:3000',
  authProvider: 'better-auth',
  ssoProvider: 'none',
  paymentProvider: 'stripe',
  storageProvider: 'local',
  jobProvider: 'memory',
  enableAuth: true,
  enableAI: true,
  enableAgents: true,
  enableBatch: true,
  enablePlayground: true,
  enableBlog: true,
  enableTeams: true,
  enableWaitlist: true,
  enableGraphQL: true,
  enableSSO: false,
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
  enableRAG: false,
  enableWebhooks: true,
  enableAuditLog: true,
  enableReports: true,
  enableBranding: true,
  enableTwoFactor: true,
  enablePlugins: true,
  removeUnusedCode: false,
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
  if (!config.enableAI) {
    config.enableRAG = false;
    config.enableAgents = false;
    config.enableBatch = false;
    config.enablePlayground = false;
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
      `${APP}/(public)/(auth)`,
      `${APP}/(public)/invite`,
      `${APP}/(protected)/(dashboard)`,
      `${APP}/(protected)/(admin)`,
      'src/app/api/auth',
      'src/lib/auth/adapters',
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
    ],
    label: 'Authentication & Dashboard',
  },
  {
    key: 'enableAI',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai`,
      'src/components/ai',
      'src/hooks/ai',
      'src/lib/ai',
      'src/app/api/ai',
    ],
    label: 'AI Chat',
  },
  {
    key: 'enableAgents',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/agents`,
      'src/components/ai/AgentBuilder.tsx',
      'src/components/ai/AgentSelector.tsx',
    ],
    label: 'AI Agents',
  },
  {
    key: 'enableBatch',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/batch`,
      'src/components/ai/BatchJobManager.tsx',
    ],
    label: 'AI Batch',
  },
  {
    key: 'enablePlayground',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/playground`,
      'src/components/ai/AIPlayground.tsx',
      'src/components/ai/PlaygroundComparison.tsx',
    ],
    label: 'AI Playground',
  },
  {
    key: 'enableBlog',
    paths: [
      `${APP}/(public)/(marketing)/blog`,
      'src/components/blog',
      'src/components/seo/BlogPostJsonLd.tsx',
      'src/lib/blog',
      'content/blog',
      'src/lib/rss.ts',
      'src/lib/rss.test.ts',
      'src/app/(marketing)/rss.xml',
      `${APP}/(public)/(marketing)/rss.xml`,
      `${APP}/rss.xml`,
    ],
    label: 'Blog',
  },
  {
    key: 'enableTeams',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/teams`,
      `${APP}/(public)/invite`,
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
      `${APP}/(public)/(marketing)/waitlist`,
      `${APP}/(protected)/(admin)/admin/waitlist`,
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
      `${APP}/(protected)/(admin)/admin/sso`,
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
      `${APP}/(public)/(marketing)/docs/api`,
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
      `${APP}/(public)/(marketing)/docs`,
      'src/lib/docs',
      'src/components/docs/HelpDocSearch.tsx',
      'src/components/seo/DocArticleJsonLd.tsx',
      'content/docs',
    ],
    label: 'Documentation',
  },
  {
    key: 'enableChangelog',
    paths: [
      `${APP}/(public)/(marketing)/changelog`,
      'src/app/api/changelog',
      'src/components/dashboard/ChangelogWidget.tsx',
    ],
    label: 'Changelog',
  },
  {
    key: 'enableExperiments',
    paths: [
      `${APP}/(protected)/(admin)/admin/experiments`,
      'src/lib/experiments',
      'src/app/api/admin/experiments',
      'src/components/admin/ExperimentManager.tsx',
    ],
    label: 'A/B Testing',
  },
  {
    key: 'enableFeatureRequests',
    paths: [
      `${APP}/(public)/(marketing)/feature-requests`,
      'src/lib/feature-requests',
      'src/app/api/feature-requests',
      'src/components/feature-requests',
    ],
    label: 'Feature Requests',
  },
  {
    key: 'enableCompare',
    paths: [
      `${APP}/(public)/(marketing)/compare`,
      'src/config/competitor-comparison.ts',
      'src/components/marketing/ComparisonTable.tsx',
    ],
    label: 'Compare',
  },
  {
    key: 'enableConnect',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/connect`,
      'src/lib/payments/connect.ts',
      'src/lib/payments/connect.test.ts',
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
      `${APP}/(protected)/(admin)/admin/drip-campaigns`,
      'src/lib/drip-campaigns',
      'src/app/api/admin/drip-campaigns',
      'src/components/admin/DripCampaignManager.tsx',
    ],
    label: 'Drip Campaigns',
  },
  {
    key: 'enableOnboarding',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/onboarding`,
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
      `${APP}/(protected)/(dashboard)/dashboard/workflows`,
      'src/lib/workflows',
      'src/app/api/workflows',
      'src/components/dashboard/WorkflowBuilder.tsx',
    ],
    label: 'Workflow Automation',
  },
  {
    key: 'enableReferrals',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/referrals`,
      'src/lib/referrals',
      'src/app/api/referrals',
      'src/components/dashboard/ReferralDashboard.tsx',
    ],
    label: 'Referral Program',
  },
  {
    key: 'enableAnalytics',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/analytics`,
      'src/lib/analytics',
      'src/app/api/analytics',
      'src/components/dashboard/AnalyticsDashboard.tsx',
    ],
    label: 'Built-in Analytics',
  },
  {
    key: 'enableWebhooks',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/webhooks`,
      `${APP}/(protected)/(admin)/admin/webhooks`,
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
      `${APP}/(protected)/(dashboard)/dashboard/audit-log`,
      `${APP}/(protected)/(admin)/admin/activity`,
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
      `${APP}/(protected)/(dashboard)/dashboard/branding`,
      'src/components/dashboard/BrandingSettings.tsx',
      'src/components/dashboard/BrandingProvider.tsx',
      'src/components/dashboard/sidebar/SidebarBrandLink.tsx',
      'src/app/api/branding',
      'src/lib/branding',
      `${APP}/(protected)/(dashboard)/dashboard/custom-domain`,
      'src/components/dashboard/CustomDomainSettings.tsx',
      'src/app/api/custom-domain',
      'src/lib/custom-domains',
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
      // `${APP}/(public)/(marketing)/plugins`,
      `${APP}/(protected)/(dashboard)/dashboard/plugins`,
      'src/lib/plugins/marketplace.ts',
      // 'src/components/marketing/PluginsShowcase.tsx',
      // 'src/components/marketing/PluginDetail.tsx',
      'src/components/dashboard/PluginMarketplace.tsx',
      'plugins/example-analytics',
    ],
    label: 'Plugin Marketplace',
  },
];

// Maps CLI enable* flags → server-side ENABLE_* env var names.
// Only flags that actually toggle runtime behavior via env.features belong here;
// everything else is removed from disk by `removeModules`.
//
// Install-time-only features (no runtime ENABLE_* — file removal only):
//   enableGraphQL, enableEventStore, enableOtel, enableConnect.
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
  enableAI: 'ENABLE_AI_CORE',
  enableRAG: 'ENABLE_AI_RAG',
  enableAgents: 'ENABLE_AI_AGENTS',
  enableBatch: 'ENABLE_AI_BATCH',
  enablePlayground: 'ENABLE_AI_PLAYGROUND',
  enableTeams: 'ENABLE_TEAMS',
  enableReferrals: 'ENABLE_REFERRALS',
  enableAnalytics: 'ENABLE_ANALYTICS',
  enableWorkflows: 'ENABLE_WORKFLOWS',
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

// codapult:prune:start {key}
// codapult:prune:replace
// codapult:prune:end {key}
const PRUNE_MARKER_FILES = [
  'src/app/sitemap.ts',
  'src/app/sitemap.test.ts',
  'src/app/(marketing)/llms.txt/route.ts',
  'src/components/marketing/Footer.tsx',
  'src/lib/auth/index.ts',
  'src/lib/auth/client-adapter.ts',
  'src/lib/jobs/definitions.ts',
  'src/lib/actions/admin.ts',
  'src/lib/actions/impersonation.ts',
  'src/lib/scheduled-reports/index.ts',
  'src/config/marketing.test.ts',
  'src/config/app.ts',
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
  };

  for (const [cliKey, envVar] of Object.entries(FEATURE_ENV_VARS)) {
    const key = cliKey as keyof ProjectConfig;
    const enabled = config[key] as boolean;
    if (!enabled) replacements[envVar] = 'false';
    if (key === 'enableRAG' && enabled) replacements[envVar] = 'true';
  }

  // The setup command treats AI as a product bundle. Keep chat enabled by
  // default for that bundle, while allowing users to disable it manually
  // after setup without disabling the shared AI core.
  replacements.ENABLE_AI_CHAT = config.enableAI ? 'true' : 'false';

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
        command: 'npx',
        args: ['-y', '@codapult/cli@latest', 'mcp-server'],
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
  const keySet = new Set(disabledKeys.map(String));
  const lines = content.split('\n');
  const out: string[] = [];

  const startRe = /^[ \t]*\/\/\s*codapult:prune:start\s+(\S+)\s*$/;
  const replaceRe = /^[ \t]*\/\/\s*codapult:prune:replace\s*$/;
  const endRe = /^[ \t]*\/\/\s*codapult:prune:end\s+(\S+)[ \t]*$/;
  const commentRe = /^([ \t]*)\/\/ ?(.*)$/;

  // Ищет ближайший terminator (replace или end с нужным key) начиная с индекса i.
  // Бросает при вложенном start того же формата. Возвращает индекс ПОСЛЕ terminator-строки.
  const seekTo = (i: number, key: string): { i: number; kind: 'replace' | 'end' } => {
    for (let j = i; j < lines.length; j += 1) {
      if (replaceRe.test(lines[j])) return { i: j + 1, kind: 'replace' };
      const end = endRe.exec(lines[j]);
      if (end?.[1] === key) return { i: j + 1, kind: 'end' };
      if (startRe.test(lines[j])) {
        throw new Error(`Nested "codapult:prune:start" before closing "${key}" (line ${j + 1}).`);
      }
    }
    throw new Error(`Unclosed "codapult:prune:start ${key}" — no matching end found.`);
  };

  for (let i = 0; i < lines.length;) {
    const start = startRe.exec(lines[i]);
    if (!start || !keySet.has(start[1])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const key = start[1];
    const body = seekTo(i + 1, key);
    if (body.kind === 'end') {
      i = body.i; // тело отбрасываем целиком
      continue;
    }

    // body.kind === 'replace': строки от body.i до end — это закомментированный replacement
    const replEnd = seekTo(body.i, key);
    if (replEnd.kind !== 'end') {
      throw new Error(`Expected "end" after "replace" for key "${key}".`);
    }

    for (let r = body.i; r < replEnd.i - 1; r++) {
      const line = lines[r];
      if (line.trim() === '') {
        out.push('');
        continue;
      }
      const m = commentRe.exec(line);
      if (!m) {
        throw new Error(
          `Line ${r + 1} in "replace" section for "${key}" is not commented out: ${JSON.stringify(line)}`,
        );
      }
      out.push(m[1] + m[2]);
    }

    i = replEnd.i;
  }

  return out.join('\n');
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
  let totalRemoved = 0;

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
    totalRemoved += removed;
    // Surface stale paths so removals don't silently no-op when the host
    // project's file layout changes (e.g. moving routes under [locale]).
    if (removed === 0 && missing.length > 0) {
      dim(`  no matching files found (expected ${missing.length} path(s))`);
    }
  }

  pruneMarkedBlocksInFiles(root, config);

  if (totalRemoved > 0) {
    dim(`Total removed: ${totalRemoved}`);
  }
}

async function interactiveSetup(): Promise<ProjectConfig> {
  const iface = createInterface({ input: process.stdin, output: process.stdout });

  heading('Codapult Setup');
  info('This wizard will configure your project.\n');

  const appName = await ask(iface, 'App name', 'Codapult');
  const appUrl = await ask(iface, 'App URL', 'http://localhost:3000');

  const authProvider = await selectPrompt<ProjectConfig['authProvider']>(iface, 'Auth provider:', [
    'better-auth',
    'kinde',
    'none',
  ]);

  const ssoProvider = await selectPrompt<ProjectConfig['ssoProvider']>(
    iface,
    'SSO provider (Enterprise SSO (SAML)):',
    ['jackson', 'none'],
  );

  const authEnabled = authProvider !== 'none';
  const ssoEnabled = authEnabled && ssoProvider !== 'none';

  const config: ProjectConfig = {
    appName,
    appUrl,
    authProvider,
    ssoProvider,
    paymentProvider: await selectPrompt<ProjectConfig['paymentProvider']>(
      iface,
      'Payment provider:',
      ['stripe', 'lemonsqueezy', 'polar'],
    ),
    storageProvider: await selectPrompt<ProjectConfig['storageProvider']>(
      iface,
      'Storage provider:',
      ['local', 's3'],
    ),
    jobProvider: await selectPrompt<ProjectConfig['jobProvider']>(iface, 'Background jobs:', [
      'memory',
      'bullmq',
      'none',
    ]),
    enableAuth: authEnabled,
    enableSSO: ssoEnabled,
    enableAI: emptyLine() && (await confirm(iface, 'Enable AI core and chat module?')),
    enableBlog: await confirm(iface, 'Enable Blog module?'),
    enableTeams: authEnabled && (await confirm(iface, 'Enable Teams/Organizations?')),
    enableWaitlist: await confirm(iface, 'Enable Waitlist page?'),
    enableGraphQL: await confirm(iface, 'Enable GraphQL API layer?'),
    enableApiDocs: await confirm(iface, 'Enable interactive API docs?'),
    enableHelpCenter: await confirm(iface, 'Enable Documentation module?'),
    enableExperiments: await confirm(iface, 'Enable A/B Testing?'),
    enableFeatureRequests: await confirm(iface, 'Enable Feature Request board?'),
    enableCompare: await confirm(iface, 'Enable competitor comparison pages (/compare)?', false),
    enableConnect: authEnabled && (await confirm(iface, 'Enable Stripe Connect (marketplace)?')),
    enableEventStore: await confirm(iface, 'Enable Event Store (event sourcing)?'),
    enableOtel: await confirm(iface, 'Enable OpenTelemetry tracing?'),
    enableDripCampaigns: await confirm(iface, 'Enable email drip campaigns?'),
    enableOnboarding: authEnabled && (await confirm(iface, 'Enable in-app onboarding tours?')),
    enableWorkflows: authEnabled && (await confirm(iface, 'Enable workflow automation?')),
    enableReferrals: authEnabled && (await confirm(iface, 'Enable referral program?')),
    enableAnalytics: await confirm(iface, 'Enable built-in analytics?'),
    enableChangelog: await confirm(iface, 'Enable Changelog page?'),
    enableRAG: await confirm(iface, 'Enable RAG pipeline (vector search)?', false),
    enableAgents: await confirm(iface, 'Enable AI agents and tools?', true),
    enableBatch: await confirm(iface, 'Enable AI batch processing?', true),
    enablePlayground: await confirm(iface, 'Enable AI playground?', true),
    enableWebhooks: authEnabled && (await confirm(iface, 'Enable outgoing webhooks?')),
    enableAuditLog: authEnabled && (await confirm(iface, 'Enable audit log / activity feed?')),
    enableReports: authEnabled && (await confirm(iface, 'Enable scheduled email reports?')),
    enableBranding: authEnabled && (await confirm(iface, 'Enable per-org branding (white-label)?')),
    enableTwoFactor:
      authEnabled && (await confirm(iface, 'Enable two-factor authentication (TOTP)?')),
    enablePlugins: await confirm(iface, 'Enable plugin marketplace (/dashboard/plugins)?'),
    removeUnusedCode: emptyLine() && (await confirm(iface, 'Remove unused module code?', false)),
  };

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

  if (config.removeUnusedCode) {
    heading('Removing unused modules');
    removeModules(root, config);
  }

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
