import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createInterface } from 'node:readline';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, info, dim } from '../utils/ui.js';

const rl = () => createInterface({ input: process.stdin, output: process.stdout });

function ask(iface: ReturnType<typeof rl>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    iface.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function confirmPrompt(iface: ReturnType<typeof rl>, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(iface, `${question} [${hint}]`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function selectPrompt(iface: ReturnType<typeof rl>, question: string, options: string[]): Promise<string> {
  console.log(`\n  ${question}`);
  options.forEach((opt, i) => console.log(`    ${i + 1}. ${opt}`));
  const answer = await ask(iface, 'Choose', '1');
  const idx = parseInt(answer, 10) - 1;
  return options[Math.max(0, Math.min(idx, options.length - 1))];
}

interface ProjectConfig {
  appName: string;
  appUrl: string;
  authProvider: 'better-auth' | 'kinde';
  paymentProvider: 'stripe' | 'lemonsqueezy';
  storageProvider: 'local' | 's3';
  jobProvider: 'memory' | 'bullmq';
  enableAI: boolean;
  enableBlog: boolean;
  enableTeams: boolean;
  enableWaitlist: boolean;
  enableGraphQL: boolean;
  enableSSO: boolean;
  enableHelpCenter: boolean;
  enableExperiments: boolean;
  enableFeatureRequests: boolean;
  enableConnect: boolean;
  enableEventStore: boolean;
  enableOtel: boolean;
  enableDripCampaigns: boolean;
  enableOnboarding: boolean;
  enableWorkflows: boolean;
  enableReferrals: boolean;
  enableAnalytics: boolean;
  enableRAG: boolean;
}

const MODULE_REMOVALS: Array<{ key: keyof ProjectConfig; paths: string[]; label: string }> = [
  { key: 'enableAI', paths: ['src/app/(dashboard)/dashboard/ai-chat', 'src/app/api/chat', 'src/components/ai'], label: 'AI Chat' },
  { key: 'enableBlog', paths: ['src/app/(marketing)/blog', 'src/components/blog', 'src/lib/blog', 'content/blog', 'src/app/rss.xml'], label: 'Blog' },
  { key: 'enableTeams', paths: ['src/app/(dashboard)/dashboard/teams', 'src/app/invite', 'src/components/dashboard/TeamSwitcher.tsx', 'src/components/dashboard/TeamSettings.tsx', 'src/components/dashboard/AcceptInvitationButton.tsx', 'src/lib/db/organizations.ts', 'src/lib/actions/organizations.ts'], label: 'Teams' },
  { key: 'enableWaitlist', paths: ['src/app/(marketing)/waitlist', 'src/components/marketing/WaitlistForm.tsx', 'src/lib/actions/waitlist.ts', 'src/app/admin/waitlist'], label: 'Waitlist' },
  { key: 'enableGraphQL', paths: ['src/lib/graphql', 'src/app/api/graphql'], label: 'GraphQL API' },
  { key: 'enableSSO', paths: ['src/lib/sso', 'src/app/api/auth/sso', 'src/app/api/admin/sso', 'src/app/admin/sso', 'src/components/admin/SSOManager.tsx'], label: 'Enterprise SSO' },
  { key: 'enableHelpCenter', paths: ['src/lib/docs', 'src/app/(marketing)/docs/help', 'src/components/docs/HelpDocSearch.tsx', 'content/docs'], label: 'Help Center' },
  { key: 'enableExperiments', paths: ['src/lib/experiments', 'src/app/api/admin/experiments', 'src/app/admin/experiments', 'src/components/admin/ExperimentManager.tsx'], label: 'A/B Testing' },
  { key: 'enableFeatureRequests', paths: ['src/lib/feature-requests', 'src/app/api/feature-requests', 'src/app/(marketing)/feature-requests', 'src/components/marketing/FeatureBoard.tsx'], label: 'Feature Requests' },
  { key: 'enableConnect', paths: ['src/lib/payments/connect.ts', 'src/app/api/connect', 'src/app/(dashboard)/dashboard/connect', 'src/components/dashboard/ConnectDashboard.tsx'], label: 'Stripe Connect' },
  { key: 'enableEventStore', paths: ['src/lib/event-store', 'src/app/api/admin/events'], label: 'Event Store' },
  { key: 'enableOtel', paths: ['src/lib/telemetry'], label: 'OpenTelemetry' },
  { key: 'enableDripCampaigns', paths: ['src/lib/drip-campaigns', 'src/app/api/admin/drip-campaigns', 'src/app/admin/drip-campaigns', 'src/components/admin/DripCampaignManager.tsx'], label: 'Drip Campaigns' },
  { key: 'enableOnboarding', paths: ['src/lib/onboarding', 'src/app/api/onboarding', 'src/components/dashboard/OnboardingTour.tsx'], label: 'Onboarding Tours' },
  { key: 'enableWorkflows', paths: ['src/lib/workflows', 'src/app/api/workflows', 'src/app/(dashboard)/dashboard/workflows', 'src/components/dashboard/WorkflowBuilder.tsx'], label: 'Workflow Automation' },
  { key: 'enableReferrals', paths: ['src/lib/referrals', 'src/app/api/referrals', 'src/app/(dashboard)/dashboard/referrals', 'src/components/dashboard/ReferralDashboard.tsx'], label: 'Referral Program' },
  { key: 'enableAnalytics', paths: ['src/lib/analytics', 'src/app/api/analytics', 'src/app/(dashboard)/dashboard/analytics', 'src/components/dashboard/AnalyticsDashboard.tsx'], label: 'Built-in Analytics' },
  { key: 'enableRAG', paths: ['src/lib/ai/chunker.ts', 'src/lib/ai/embeddings.ts', 'src/lib/ai/vector-store.ts', 'src/lib/ai/rag.ts', 'src/app/api/ai'], label: 'RAG Pipeline' },
];

function generateEnvFile(root: string, config: ProjectConfig): void {
  const envExamplePath = join(root, '.env.example');
  const envLocalPath = join(root, '.env.local');

  if (existsSync(envLocalPath)) {
    info('.env.local already exists — creating .env.local.new instead');
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

function removeModules(root: string, config: ProjectConfig): void {
  for (const removal of MODULE_REMOVALS) {
    if (config[removal.key]) continue;

    dim(`Removing ${removal.label}...`);
    for (const p of removal.paths) {
      const fullPath = resolve(root, p);
      if (existsSync(fullPath)) {
        rmSync(fullPath, { recursive: true });
        dim(`  deleted ${p}`);
      }
    }
  }
}

export async function setupCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a LaunchKit project. Run this from your project directory.');
    process.exit(1);
  }

  const iface = rl();

  heading('LaunchKit Setup');
  info('This wizard will configure your project.\n');

  const config: ProjectConfig = {
    appName: await ask(iface, 'App name', 'LaunchKit'),
    appUrl: await ask(iface, 'App URL', 'http://localhost:3000'),
    authProvider: (await selectPrompt(iface, 'Auth provider:', ['better-auth', 'kinde'])) as ProjectConfig['authProvider'],
    paymentProvider: (await selectPrompt(iface, 'Payment provider:', ['stripe', 'lemonsqueezy'])) as ProjectConfig['paymentProvider'],
    storageProvider: (await selectPrompt(iface, 'Storage provider:', ['local', 's3'])) as ProjectConfig['storageProvider'],
    jobProvider: (await selectPrompt(iface, 'Background jobs:', ['memory', 'bullmq'])) as ProjectConfig['jobProvider'],
    enableAI: await confirmPrompt(iface, 'Enable AI Chat module?'),
    enableBlog: await confirmPrompt(iface, 'Enable Blog module?'),
    enableTeams: await confirmPrompt(iface, 'Enable Teams/Organizations?'),
    enableWaitlist: await confirmPrompt(iface, 'Enable Waitlist page?'),
    enableGraphQL: await confirmPrompt(iface, 'Enable GraphQL API layer?'),
    enableSSO: await confirmPrompt(iface, 'Enable Enterprise SSO (SAML)?'),
    enableHelpCenter: await confirmPrompt(iface, 'Enable Help Center (docs)?'),
    enableExperiments: await confirmPrompt(iface, 'Enable A/B Testing?'),
    enableFeatureRequests: await confirmPrompt(iface, 'Enable Feature Request board?'),
    enableConnect: await confirmPrompt(iface, 'Enable Stripe Connect (marketplace)?'),
    enableEventStore: await confirmPrompt(iface, 'Enable Event Store (event sourcing)?'),
    enableOtel: await confirmPrompt(iface, 'Enable OpenTelemetry tracing?'),
    enableDripCampaigns: await confirmPrompt(iface, 'Enable email drip campaigns?'),
    enableOnboarding: await confirmPrompt(iface, 'Enable in-app onboarding tours?'),
    enableWorkflows: await confirmPrompt(iface, 'Enable workflow automation?'),
    enableReferrals: await confirmPrompt(iface, 'Enable referral program?'),
    enableAnalytics: await confirmPrompt(iface, 'Enable built-in analytics?'),
    enableRAG: await confirmPrompt(iface, 'Enable RAG pipeline (vector search)?'),
  };

  heading('Generating configuration');
  generateEnvFile(root, config);

  if (await confirmPrompt(iface, 'Remove unused module code?', false)) {
    heading('Removing unused modules');
    removeModules(root, config);
  }

  iface.close();

  heading('Done!');
  info('Next steps:');
  dim('1. Fill in secrets in .env.local');
  dim('2. pnpm install');
  dim('3. pnpm db:push');
  dim('4. pnpm dev');
  console.log();
}
