import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { checkProjectRoot } from '../utils/project.js';
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  type ProjectEnvOptions,
} from '../utils/project-env.js';
import { ENV_SCHEMA_KEYS } from '../utils/env-config.js';
import { heading, success, fail, info, dim, ask, confirm, warn } from '../utils/ui.js';

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

export interface ProjectConfig {
  appName: string;
  appUrl: string;
  appMode: 'app' | 'landing' | 'full' | 'demo';
  authProvider: 'better-auth' | 'kinde' | 'none';
  paymentProvider: 'stripe' | 'lemonsqueezy' | 'polar';
  ssoProvider: 'jackson' | 'none';
  storageProvider: 'local' | 's3';
  jobProvider: 'memory' | 'bullmq' | 'none';
  enableAuth: boolean;
  enableAI: boolean;
  enableRAG: boolean;
  enableAiChat: boolean;
  enableAgents: boolean;
  enableBatch: boolean;
  enablePlayground: boolean;
  enableBlog: boolean;
  enableTeams: boolean;
  enableWaitlist: boolean;
  enableGraphQL: boolean;
  enableSSO: boolean;
  enableApiDocs: boolean;
  enableDocs: boolean;
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
  enablePromotions: boolean;
  enableSeo: boolean;
  removeUnusedCode: boolean;
  cleanPruneMarkers: boolean;
}

// ---------------------------------------------------------------------------
// Built-in presets for non-interactive (CI/CD) setup via --preset flag.
// ---------------------------------------------------------------------------

const BUILT_IN_PRESETS: Record<string, Partial<ProjectConfig>> = {
  saas: {},
  'ai-saas': {
    enableAI: true,
    enableRAG: true,
    enableAgents: true,
    enableBatch: true,
    enablePlayground: true,
  },
  'b2b-saas': {
    authProvider: 'better-auth',
    ssoProvider: 'jackson',
    enableAuth: true,
    enableSSO: true,
    enableTeams: true,
    enableBranding: true,
    enableAuditLog: true,
    enableReports: true,
    enableWebhooks: true,
  },
  'ai-chatbot': {
    enableAI: true,
    enableAiChat: true,
    enableRAG: false,
    enableAgents: false,
    enableBatch: false,
    enablePlayground: false,
    enableTeams: true,
    enableAuditLog: true,
    enableWebhooks: true,
  },
  marketplace: {
    enableTeams: true,
    enableConnect: true,
    enableWebhooks: true,
    enableAuditLog: true,
    enableBranding: true,
  },
  'internal-tool': {
    enableAI: false,
    enableBlog: false,
    enableTeams: true,
    enableConnect: false,
    enableSSO: false,
    enableWorkflows: true,
    enableAnalytics: true,
    enableWebhooks: true,
    enableAuditLog: true,
    enableReports: true,
    enableBranding: true,
    enableReferrals: false,
    enableChangelog: false,
    enableWaitlist: false,
    enableFeatureRequests: false,
    enableCompare: false,
    removeUnusedCode: true,
  },
  'content-saas': {
    enableAI: false,
    enableBlog: true,
    enableTeams: false,
    enableWorkflows: true,
    enableAnalytics: true,
    enableOnboarding: true,
    enableReferrals: true,
    enableChangelog: true,
    enableWaitlist: true,
    enableFeatureRequests: false,
    enableCompare: false,
    enableWebhooks: true,
    enableAuditLog: true,
    removeUnusedCode: true,
  },
  // Marketing-only site.
  marketing: {
    appMode: 'landing',
    authProvider: 'none',
    jobProvider: 'none',
    ssoProvider: 'none',
    enableAuth: false,
    enableAI: false,
    enableAiChat: false,
    enableRAG: false,
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
    enablePlugins: false,
    enableDocs: true,
    enableBlog: true,
    enablePromotions: true,
    enableSeo: true,
    enableCompare: true,
    removeUnusedCode: true,
  },
  demo: {
    appMode: 'demo',
    authProvider: 'better-auth',
  },
};

const DEFAULT_CONFIG: ProjectConfig = {
  appName: 'Codapult',
  appUrl: 'http://localhost:3000',
  appMode: 'full',
  authProvider: 'better-auth',
  ssoProvider: 'none',
  paymentProvider: 'stripe',
  storageProvider: 'local',
  jobProvider: 'memory',
  enableAuth: true,
  enableAI: true,
  enableAiChat: true,
  enableRAG: false,
  enableAgents: true,
  enableBatch: true,
  enablePlayground: true,
  enableBlog: true,
  enableTeams: true,
  enableWaitlist: true,
  enableGraphQL: true,
  enableSSO: false,
  enableApiDocs: true,
  enableDocs: true,
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
  enableWebhooks: true,
  enableAuditLog: true,
  enableReports: true,
  enableBranding: true,
  enableTwoFactor: true,
  enablePlugins: true,
  enablePromotions: true,
  enableSeo: true,
  removeUnusedCode: false,
  cleanPruneMarkers: true,
};

function parsePresetValue(raw: string): Partial<ProjectConfig> {
  const parts = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const result: Record<string, unknown> = {};

  // if (parts.length === 1 && !parts[0].includes('=')) {
  //   const name = parts[0];
  //   if (!(name in BUILT_IN_PRESETS)) {
  //     fail(`Unknown preset: "${name}". Available: ${Object.keys(BUILT_IN_PRESETS).join(', ')}`);
  //     process.exit(1);
  //   }
  //   return BUILT_IN_PRESETS[name];
  // }

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

export function resolvePreset(raw: string): ProjectConfig {
  const overrides = parsePresetValue(raw);
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (config.authProvider === 'none') {
    config.enableAuth = false;
  }
  if (!config.enableAI) {
    config.enableAiChat = false;
    config.enableRAG = false;
    config.enableAgents = false;
    config.enableBatch = false;
    config.enablePlayground = false;
  }
  if (!config.enableTeams) {
    config.enableBranding = false;
  }

  return config;
}

export function getPresetNames(): string[] {
  return Object.keys(BUILT_IN_PRESETS);
}

// All app-router paths are under `src/app/[locale]/...` (next-intl).
// API routes (`src/app/api/...`) and `src/lib`/`src/components` paths
// are NOT under [locale].
const APP = 'src/app/[locale]';

const MODULE_REMOVALS: {
  key: keyof ProjectConfig | (keyof ProjectConfig)[];
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
      'src/lib/auth/index.test.ts',
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
    key: 'enableAiChat',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/chat`,
      'src/components/ai/ChatUI.tsx',
      'src/app/api/ai/chat',
      'src/lib/ai/conversations.ts',
    ],
    label: 'AI Chat',
  },
  {
    key: 'enableRAG',
    paths: [
      'src/lib/ai/chunker.ts',
      'src/lib/ai/chunker.test.ts',
      'src/lib/ai/embeddings',
      'src/lib/ai/vector-store',
      'src/lib/ai/rag.ts',
      'src/lib/ai/rag.test.ts',
      'src/app/api/ai/index',
      'src/app/api/ai/search',
    ],
    label: 'RAG Pipeline',
  },
  {
    key: 'enableAgents',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/agents`,
      'src/components/ai/AgentBuilder.tsx',
      'src/components/ai/AgentSelector.tsx',
      'src/lib/ai/tools/agent-runner.ts',
      'src/lib/ai/tools/agent-runner.test.ts',
      'src/hooks/ai/useAgents.ts',
    ],
    label: 'AI Agents',
  },
  {
    key: 'enableBatch',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/batch`,
      'src/components/ai/BatchJobManager.tsx',
      'src/lib/ai/batch',
    ],
    label: 'AI Batch',
  },
  {
    key: 'enablePlayground',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/ai/playground`,
      'src/components/ai/AIPlayground.tsx',
      'src/components/ai/PlaygroundComparison.tsx',
      'src/lib/ai/playground',
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
      'src/lib/organizations/quotas.ts',
      'src/lib/organizations/quotas.test.ts',
      'src/lib/organizations/active-org-cookie.ts',
      'src/lib/payments/seats.ts',
      'src/lib/payments/seats.test.ts',
      'src/lib/scim',
      'src/app/api/scim',
    ],
    label: 'Teams',
  },
  {
    key: 'enableWaitlist',
    paths: [
      `${APP}/(public)/(marketing)/waitlist`,
      `${APP}/(protected)/(admin)/admin/waitlist`,
      'src/components/waitlist',
      'src/components/admin/WaitlistTable.tsx',
      'src/lib/actions/waitlist.ts',
      'src/app/api/admin/export/waitlist',
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
    key: 'enableDocs',
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
      'src/components/marketing/compare',
      'src/config/competitor-comparison.ts',
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
    key: 'enablePromotions',
    paths: [
      `${APP}/(protected)/(admin)/admin/promotions`,
      'src/components/admin/PromotionDurationFields.tsx',
      'src/lib/actions/promotions.ts',
      'src/lib/actions/promotions.test.ts',
    ],
    label: 'Promotions',
  },
  {
    key: 'enableReferrals',
    paths: [
      `${APP}/(protected)/(dashboard)/dashboard/referrals`,
      'src/components/dashboard/ReferralDashboard.tsx',
      'src/lib/referrals',
      'src/lib/payments/referral-webhook.ts',
      'src/lib/payments/referral-webhook.test.ts',
      'src/lib/usage.test.ts',
      'src/app/api/referrals',
    ],
    label: 'Referral Program',
  },
  {
    key: ['enablePromotions', 'enableReferrals'],
    paths: [
      'src/components/marketing/PromotionErrorToast.tsx',
      'src/lib/promotions',
      'src/lib/payments/promotion-checkout.ts',
      'src/lib/payments/promotion-webhook.ts',
      'src/lib/payments/promotion-webhook-data.ts',
    ],
    label: 'Promotions & Referral Program',
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
      'src/components/dashboard/OutgoingWebhooks.tsx',
      'src/app/api/webhooks/outgoing',
      'src/lib/webhooks/outgoing.ts',
      'src/lib/webhooks/outgoing.test.ts',
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
      `${APP}/(protected)/(dashboard)/dashboard/reports`,
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
    paths: [
      'src/components/dashboard/TwoFactorSettings.tsx',
      'src/lib/email/templates/TwoFactorOtpEmail.tsx',
    ],
    label: 'Two-factor Authentication',
  },
  {
    key: 'enablePlugins',
    paths: [
      // `${APP}/(public)/(marketing)/plugins`,
      `${APP}/(protected)/(dashboard)/dashboard/plugins`,
      // 'src/components/marketing/plugins/PluginsShowcase.tsx',
      // 'src/components/marketing/plugins/PluginDetail.tsx',
      'src/components/dashboard/PluginMarketplace.tsx',
      'src/lib/plugins/marketplace.ts',
      'plugins/example-analytics',
    ],
    label: 'Plugin Marketplace',
  },
  {
    key: 'enableSeo',
    paths: [
      'src/app/robots.ts',
      'src/app/robots.test.ts',
      'src/app/sitemap.ts',
      'src/app/sitemap.test.ts',
    ],
    label: 'SEO robots route',
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
const FEATURE_ENV_VARS: Partial<Record<keyof ProjectConfig, (typeof ENV_SCHEMA_KEYS)[number]>> = {
  enableApiDocs: 'ENABLE_API_DOCS',
  enableDocs: 'ENABLE_DOCS',
  enableChangelog: 'ENABLE_CHANGELOG',
  enableBlog: 'ENABLE_BLOG',
  enableWaitlist: 'ENABLE_WAITLIST',
  enableFeatureRequests: 'ENABLE_FEATURE_REQUESTS',
  enableCompare: 'ENABLE_COMPARE',
  enableAI: 'ENABLE_AI',
  enableAiChat: 'ENABLE_AI_CHAT',
  enableRAG: 'ENABLE_AI_RAG',
  enableAgents: 'ENABLE_AI_AGENTS',
  enableBatch: 'ENABLE_AI_BATCH',
  enablePlayground: 'ENABLE_AI_PLAYGROUND',
  enableTeams: 'ENABLE_TEAMS',
  enableReferrals: 'ENABLE_REFERRALS',
  enablePromotions: 'ENABLE_PROMOTIONS',
  enableSeo: 'ENABLE_SEO',
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

// codapult:prune:start {key[,key...]}
// codapult:prune:replace
// codapult:prune:end {key[,key...]}
const PRUNE_MARKER_FILES = [
  'src/app/sitemap.ts',
  'src/app/sitemap.test.ts',
  'src/app/(marketing)/llms.txt/route.ts',
  'src/app/(marketing)/llms.txt/route.test.ts',
  'src/app/api/checkout/route.ts',
  'src/app/api/checkout/route.test.ts',
  'src/app/api/auth/sso/callback/route.ts',
  'src/app/api/auth/sso/callback/route.test.ts',
  'src/app/api/webhooks/stripe/route.ts',
  'src/app/api/webhooks/stripe/route.test.ts',
  'src/app/api/webhooks/polar/route.ts',
  'src/app/api/webhooks/lemonsqueezy/route.ts',
  'src/app/api/analytics/route.ts',
  'src/app/api/analytics/route.test.ts',
  'src/app/api/reports/route.ts',
  'src/app/api/ai/chat/route.ts',
  'src/app/api/ai/index/route.ts',
  'src/app/api/ai/search/route.ts',
  'src/components/auth/AuthForm.tsx',
  'src/components/marketing/Footer.tsx',
  'src/components/marketing/landing/PricingSection.tsx',
  'src/components/MdxContent.tsx',
  'src/components/dashboard/sidebar/Sidebar.tsx',
  'src/components/dashboard/sidebar/SidebarContent.tsx',
  'src/components/ai/ChatUI.tsx',
  'src/components/ai/index.ts',
  `${APP}/(public)/layout.tsx`,
  `${APP}/(public)/(auth)/layout.tsx`,
  `${APP}/(public)/(auth)/sign-in/page.tsx`,
  `${APP}/(public)/(auth)/sign-up/page.tsx`,
  `${APP}/(public)/(marketing)/page.tsx`,
  `${APP}/(protected)/(dashboard)/layout.tsx`,
  `${APP}/(protected)/(dashboard)/dashboard/analytics/page.tsx`,
  `${APP}/(protected)/(dashboard)/dashboard/billing/page.tsx`,
  `${APP}/(protected)/(dashboard)/dashboard/reports/page.tsx`,
  `${APP}/(protected)/(dashboard)/dashboard/settings/page.tsx`,
  `${APP}/(protected)/(admin)/layout.tsx`,
  'src/lib/validation.ts',
  'src/lib/ai/api.ts',
  'src/lib/ai/api-schemas.ts',
  'src/lib/ai/tools/index.ts',
  'src/lib/ai/tools/manager.ts',
  'src/lib/ai/tools/types.ts',
  'src/hooks/ai/useGateway.ts',
  'src/lib/ai/metering/logger.ts',
  'src/lib/ai/metering/types.ts',
  'src/lib/ai/rag.ts',
  'src/lib/ai/gateway/pipeline.ts',
  'src/lib/ai/tools/executor.ts',
  'src/lib/auth/index.ts',
  'src/lib/auth/client-adapter.ts',
  'src/lib/auth/client-adapter.test.ts',
  'src/lib/auth/adapters/better-auth.ts',
  'src/lib/auth/adapters/better-auth.test.ts',
  'src/lib/auth/adapters/better-auth-client.ts',
  'src/lib/auth/adapters/better-auth-client.test.ts',
  'src/lib/auth/adapters/kinde.ts',
  'src/lib/auth/adapters/kinde.test.ts',
  'src/lib/auth/adapters/kinde-client.ts',
  'src/lib/jobs/definitions.ts',
  'src/lib/jobs/definitions.test.ts',
  'src/lib/actions/admin.ts',
  'src/lib/actions/admin.test.ts',
  'src/lib/actions/billing.ts',
  'src/lib/payments/adapter.ts',
  'src/lib/payments/adapters/stripe.ts',
  'src/lib/payments/adapters/stripe.test.ts',
  'src/lib/payments/adapters/polar.ts',
  'src/lib/payments/adapters/polar.test.ts',
  'src/lib/payments/adapters/lemonsqueezy.ts',
  'src/lib/actions/impersonation.ts',
  'src/lib/actions/impersonation.test.ts',
  'src/lib/scheduled-reports/index.ts',
  'src/lib/gdpr/index.ts',
  'src/lib/gdpr/gdpr.test.ts',
  'src/lib/email/index.ts',
  'src/lib/usage.ts',
  'src/lib/guards.ts',
  'src/lib/guards.test.ts',
  'src/lib/db/schema.ts',
  'src/lib/db/schema-pg.ts',
  'src/lib/db/admin.ts',
  'src/lib/onboarding/checks.ts',
  'src/lib/organizations/context.ts',
  'src/config/env.ts',
  'src/config/navigation.ts',
  'src/config/marketing.test.ts',
  'src/config/env-schema.ts',
  'src/instrumentation.ts',
  'src/proxy.ts',
  'src/proxy.test.ts',
  'scripts/seed.ts',
] as const;

export function buildEnvContent(content: string, config: ProjectConfig): string {
  let result = content;
  const replacements: Partial<Record<(typeof ENV_SCHEMA_KEYS)[number], string>> = {
    NEXT_PUBLIC_APP_NAME: config.appName,
    NEXT_PUBLIC_APP_URL: config.appUrl,
    APP_MODE: config.appMode,
    AUTH_PROVIDER: config.authProvider,
    SSO_PROVIDER: config.ssoProvider,
    PAYMENT_PROVIDER: config.paymentProvider,
    STORAGE_PROVIDER: config.storageProvider,
    JOB_PROVIDER: config.jobProvider,
  };

  for (const [cliKey, envVar] of Object.entries(FEATURE_ENV_VARS)) {
    const enabled = config[cliKey as keyof ProjectConfig];
    if (typeof enabled === 'boolean') {
      replacements[envVar] = String(enabled);
    }
  }

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(result)) {
      result = result.replace(regex, `${key}=${value}`);
    } else {
      result += `\n${key}=${value}`;
    }
  }

  return result;
}

function generateEnvFile(root: string, config: ProjectConfig): void {
  const envExamplePath = join(root, ENV_EXAMPLE_FILE_NAME);
  const envLocalPath = join(root, ENV_FILE_NAME);

  if (existsSync(envLocalPath)) {
    info(`${ENV_FILE_NAME} already exists — creating ${ENV_FILE_NAME}.new instead`);
  }

  const exampleContent = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';
  const content = buildEnvContent(exampleContent, config);

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
  cleanMarkers: boolean,
): string {
  const keySet = new Set(disabledKeys.map(String));
  const keyList = '([A-Za-z][A-Za-z0-9]*(?:,[A-Za-z][A-Za-z0-9]*)*)';
  const startRe = new RegExp(`^[ \\t]*\\/\\/\\s*codapult:prune:start\\s+${keyList}[ \\t]*$`);
  const jsxStartRe = new RegExp(
    `^[ \\t]*\\{\\/\\*\\s*codapult:prune:start\\s+${keyList}\\s*\\*\\/\\}[ \\t]*$`,
  );
  const replaceRe =
    /^[ \t]*(?:\/\/\s*codapult:prune:replace|\{\/\*\s*codapult:prune:replace\s*\*\/\})[ \t]*$/;
  const endRe = new RegExp(`^[ \\t]*.*?\\/\\/\\s*codapult:prune:end\\s+${keyList}[ \\t]*$`);
  const jsxEndRe = new RegExp(
    `^[ \\t]*\\{\\/\\*\\s*codapult:prune:end\\s+${keyList}\\s*\\*\\/\\}[ \\t]*$`,
  );
  const commentRe = /^([ \t]*)(?:\/\/ ?(.*)|\{\/\*\s?(.*?)\s?\*\/\})$/;

  const parseKeys = (value: string): string[] => [...new Set(value.split(','))].sort();
  const matchStart = (line: string): RegExpExecArray | null =>
    startRe.exec(line) ?? jsxStartRe.exec(line);
  const matchEnd = (line: string): RegExpExecArray | null =>
    endRe.exec(line) ?? jsxEndRe.exec(line);
  const hasSameKeys = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((key, index) => key === right[index]);

  const findBlockEnd = (
    lines: string[],
    startIndex: number,
    rootKeys: string[],
  ): { endIndex: number; replaceIndex: number | undefined } => {
    const stack = [rootKeys];
    let replaceIndex: number | undefined;

    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const nestedStart = matchStart(lines[i]);
      if (nestedStart) {
        stack.push(parseKeys(nestedStart[1]));
        continue;
      }

      const end = matchEnd(lines[i]);
      if (end && hasSameKeys(parseKeys(end[1]), stack[stack.length - 1])) {
        stack.pop();
        if (stack.length === 0) return { endIndex: i, replaceIndex };
        continue;
      }

      if (stack.length === 1 && replaceRe.test(lines[i]) && replaceIndex === undefined) {
        replaceIndex = i;
      }
    }

    throw new Error(
      `Unclosed "codapult:prune:start ${rootKeys.join(',')}" — no matching end found.`,
    );
  };

  const processLines = (lines: string[]): string[] => {
    const out: string[] = [];

    for (let i = 0; i < lines.length;) {
      const start = matchStart(lines[i]);
      if (!start) {
        out.push(lines[i]);
        i += 1;
        continue;
      }

      const keys = parseKeys(start[1]);
      const { endIndex, replaceIndex } = findBlockEnd(lines, i, keys);
      const shouldPrune = keys.every((key) => keySet.has(key));

      if (shouldPrune) {
        if (replaceIndex !== undefined) {
          const replacement: string[] = [];
          for (let r = replaceIndex + 1; r < endIndex; r += 1) {
            const line = lines[r];
            if (line.trim() === '') {
              replacement.push('');
              continue;
            }
            const match = commentRe.exec(line);
            if (!match) {
              throw new Error(
                `Line ${r + 1} in "replace" section for "${keys.join(',')}" is not commented out: ${JSON.stringify(line)}`,
              );
            }
            replacement.push(match[1] + (match[2] ?? match[3]));
          }
          out.push(...processLines(replacement));
        }
      } else {
        out.push(lines[i]);
        const bodyEnd = replaceIndex ?? endIndex;
        out.push(...processLines(lines.slice(i + 1, bodyEnd)));
        if (replaceIndex !== undefined) {
          out.push(lines[replaceIndex]);
          out.push(...processLines(lines.slice(replaceIndex + 1, endIndex)));
        }
        out.push(lines[endIndex]);
      }

      i = endIndex + 1;
    }

    return out;
  };

  const result = processLines(content.split('\n'));
  return (
    cleanMarkers
      ? result.flatMap((line) => {
          if (endRe.test(line)) {
            const markerIndex = line.indexOf('// codapult:prune:end');
            const prefix = line.slice(0, markerIndex);
            return prefix.trim() ? [prefix.trimEnd()] : [];
          }
          if (
            startRe.test(line) ||
            jsxStartRe.test(line) ||
            replaceRe.test(line) ||
            jsxEndRe.test(line)
          ) {
            return [];
          }
          return [line];
        })
      : result
  ).join('\n');
}

function pruneMarkedBlocksInFiles(
  root: string,
  config: ProjectConfig,
  cleanMarkers: boolean,
): void {
  const disabledKeys = (Object.keys(config) as (keyof ProjectConfig)[]).filter(
    (key) => key.startsWith('enable') && config[key] === false,
  );

  if (disabledKeys.length === 0 && !cleanMarkers) return;

  dim(`Pruning files...`);

  for (const relativePath of PRUNE_MARKER_FILES) {
    const fullPath = resolve(root, relativePath);
    if (!existsSync(fullPath)) continue;

    const original = readFileSync(fullPath, 'utf-8');
    const pruned = pruneMarkedBlocks(original, disabledKeys, cleanMarkers);

    if (pruned !== original) {
      writeFileSync(fullPath, pruned, 'utf-8');
      dim(`  patched ${relativePath}`);
    }
  }
}

function removeModules(root: string, config: ProjectConfig): void {
  let totalRemoved = 0;

  for (const removal of MODULE_REMOVALS) {
    const keys = Array.isArray(removal.key) ? removal.key : [removal.key];
    if (keys.every((key) => !config[key])) {
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
  }

  if (totalRemoved > 0) {
    dim(`Total removed: ${totalRemoved}`);
  }
}

function format(root: string): void {
  const prettierPath = resolve(root, 'node_modules/.bin/prettier');
  if (existsSync(prettierPath)) {
    const formatCode = spawnSync(
      'pnpm',
      ['exec', 'prettier', '--write', '.', '--log-level', 'warn'],
      { cwd: root, stdio: 'inherit' },
    ).status;
    if (formatCode === 0) dim('Formatted successfully.');
    else warn(`Formatting failed (exit ${formatCode}).`);
  } else {
    dim('Prettier is unavailable; skipping formatting');
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
    appMode: 'full',
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
    enableAiChat: await confirm(iface, 'Enable AI Chat?', true),
    enableRAG: await confirm(iface, 'Enable RAG pipeline (vector search)?', false),
    enableAgents: await confirm(iface, 'Enable AI agents and tools?', true),
    enableBatch: await confirm(iface, 'Enable AI batch processing?', true),
    enablePlayground: await confirm(iface, 'Enable AI playground?', true),
    enableBlog: await confirm(iface, 'Enable Blog module?'),
    enableTeams: authEnabled && (await confirm(iface, 'Enable Teams/Organizations?')),
    enableWaitlist: await confirm(iface, 'Enable Waitlist page?'),
    enableGraphQL: await confirm(iface, 'Enable GraphQL API layer?'),
    enableApiDocs: await confirm(iface, 'Enable interactive API docs?'),
    enableDocs: await confirm(iface, 'Enable Documentation module?'),
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
    enableWebhooks: authEnabled && (await confirm(iface, 'Enable outgoing webhooks?')),
    enableAuditLog: authEnabled && (await confirm(iface, 'Enable audit log / activity feed?')),
    enableReports: authEnabled && (await confirm(iface, 'Enable scheduled email reports?')),
    enableBranding: authEnabled && (await confirm(iface, 'Enable per-org branding (white-label)?')),
    enableTwoFactor:
      authEnabled && (await confirm(iface, 'Enable two-factor authentication (TOTP)?')),
    enablePlugins: await confirm(iface, 'Enable plugin marketplace (/dashboard/plugins)?'),
    enablePromotions: await confirm(iface, 'Enable promotion codes and pricing overrides?', true),
    enableSeo: await confirm(iface, 'Enable SEO robots directives?', true),
    removeUnusedCode: emptyLine() && (await confirm(iface, 'Remove unused module code?', false)),
    cleanPruneMarkers: await confirm(iface, 'Remove prune markers from code?', true),
  };

  if (!config.enableTeams && config.enableBranding) {
    info('Per-org branding and custom domains require Teams; disabling them.');
    config.enableBranding = false;
  }

  iface.close();
  return config;
}

interface SetupOptions extends Pick<ProjectEnvOptions, 'envFile'> {
  preset?: string;
  // cleanPruneMarkers?: boolean;
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  const root = checkProjectRoot('exit');

  const presetRaw = options.preset;

  let config: ProjectConfig;

  if (presetRaw) {
    heading('Codapult Setup (preset mode)');
    info(`Applying preset: ${presetRaw}`);
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

  if (config.removeUnusedCode || config.cleanPruneMarkers) {
    pruneMarkedBlocksInFiles(root, config, config.cleanPruneMarkers);
    heading('Formatting after removing unused code');
    format(root);
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
