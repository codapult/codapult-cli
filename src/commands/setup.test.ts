import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writeProjectEnvSources } from '../utils/test-project-env.js';
import { buildEnvContent, getPresetNames, resolvePreset, setupCommand } from './setup.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../codapult');

describe('setup presets', () => {
  it('exposes the starter profiles', () => {
    expect(getPresetNames()).toEqual(
      expect.arrayContaining([
        'saas',
        'ai-saas',
        'b2b-saas',
        'ai-chatbot',
        'marketplace',
        'internal-tool',
        'content-saas',
        'marketing',
        'demo',
      ]),
    );
  });

  it('configures the AI SaaS profile', () => {
    const config = resolvePreset('ai-saas');

    expect(config.enableAI).toBe(true);
    expect(config.enableRAG).toBe(true);
    expect(config.enableAgents).toBe(true);
  });

  it('configures the B2B SaaS profile', () => {
    const config = resolvePreset('b2b-saas');

    expect(config.enableSSO).toBe(true);
    expect(config.ssoProvider).toBe('jackson');
    expect(config.enableTeams).toBe(true);
    expect(config.enableBranding).toBe(true);
  });

  it('configures product recipes from existing setup flags', () => {
    const chatbot = resolvePreset('ai-chatbot');
    expect(chatbot.enableAI).toBe(true);
    expect(chatbot.enableAiChat).toBe(true);
    expect(chatbot.enableAgents).toBe(false);

    const marketplace = resolvePreset('marketplace');
    expect(marketplace.enableConnect).toBe(true);
    expect(marketplace.enableTeams).toBe(true);

    const internalTool = resolvePreset('internal-tool');
    expect(internalTool.enableAI).toBe(false);
    expect(internalTool.enableWorkflows).toBe(true);
    expect(internalTool.removeUnusedCode).toBe(true);

    const contentSaas = resolvePreset('content-saas');
    expect(contentSaas.enableBlog).toBe(true);
    expect(contentSaas.enableTeams).toBe(false);
    expect(contentSaas.enableBranding).toBe(false);
    expect(contentSaas.enableWorkflows).toBe(true);
  });

  it('disables organization branding when Teams are disabled', () => {
    const config = resolvePreset('enableTeams=false;enableBranding=true');

    expect(config.enableTeams).toBe(false);
    expect(config.enableBranding).toBe(false);
  });

  it('sets marketing mode for the marketing preset', () => {
    const config = resolvePreset('marketing');

    expect(config.appMode).toBe('landing');
    expect(config.authProvider).toBe('none');
    expect(config.enableAuth).toBe(false);
    expect(config.removeUnusedCode).toBe(true);
  });

  it('sets demo mode for the demo preset', () => {
    const config = resolvePreset('demo');

    expect(config.appMode).toBe('demo');
    expect(config.authProvider).toBe('better-auth');
  });

  it('keeps full mode for custom presets by default', () => {
    expect(resolvePreset('enableAI=false').appMode).toBe('full');
  });

  it('writes the selected app mode into generated env content', () => {
    const marketing = buildEnvContent(
      '# APP_MODE="demo"\n',
      resolvePreset('marketing'),
      projectRoot,
    );
    const demo = buildEnvContent('# APP_MODE="demo"\n', resolvePreset('demo'), projectRoot);

    expect(marketing).toContain('APP_MODE=landing');
    expect(demo).toContain('APP_MODE=demo');
  });

  it('writes promotion and SEO feature flags when setup disables them', () => {
    const env = buildEnvContent(
      '# APP_MODE="full"\n# ENABLE_PROMOTIONS="true"\n# ENABLE_SEO="true"\n',
      resolvePreset('enablePromotions=false;enableSeo=false'),
      projectRoot,
    );

    expect(env).toContain('ENABLE_PROMOTIONS=false');
    expect(env).toContain('ENABLE_SEO=false');
  });

  it('writes enabled SEO explicitly for modes where its schema default is off', () => {
    const env = buildEnvContent(
      '# APP_MODE="full"\n# ENABLE_SEO="false"\n',
      resolvePreset('enableSeo=true'),
      projectRoot,
    );

    expect(env).toContain('ENABLE_SEO=true');
  });

  it('applies the marketing preset to a project fixture', async () => {
    const previousCwd = process.cwd();
    const root = mkdtempSync(join(tmpdir(), 'codapult-setup-'));
    const reportsDir = join(root, 'src/app/[locale]/(protected)/(dashboard)/dashboard/reports');

    mkdirSync(join(root, 'src/config'), { recursive: true });
    mkdirSync(join(root, 'src/lib/db'), { recursive: true });
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'codapult' }));
    writeProjectEnvSources(root);
    writeFileSync(join(root, '.env.example'), 'APP_MODE="full"\nNEXT_PUBLIC_APP_NAME="Codapult"\n');
    writeFileSync(
      join(root, 'src/lib/db/schema.ts'),
      [
        '// codapult:prune:start enableFeatureRequests',
        'export const featureRequest = true;',
        '// codapult:prune:end enableFeatureRequests',
        '// codapult:prune:start enableExperiments',
        'export const experiment = true;',
        '// codapult:prune:end enableExperiments',
        '// codapult:prune:start enableAI',
        'export const aiPrompt = true;',
        '// codapult:prune:end enableAI',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(root, 'src/lib/db/schema-pg.ts'),
      [
        '// codapult:prune:start enableAI',
        'export const aiPrompt = true;',
        '// codapult:prune:start enableAgents',
        'export const agentId = true;',
        '// codapult:prune:end enableAgents',
        '// codapult:prune:end enableAI',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(root, 'src/config/navigation.ts'),
      [
        'export const navigation = [',
        '  // codapult:prune:start enableAI',
        "  { href: '/dashboard/ai' },",
        '  // codapult:prune:end enableAI',
        "  { href: '/dashboard' },",
        '];',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(root, 'src/proxy.ts'),
      [
        '// codapult:prune:start enableAI',
        "if (path === '/api/ai') return true;",
        '// codapult:prune:end enableAI',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(reportsDir, 'page.tsx'),
      'export default function Reports() { return null; }\n',
    );

    try {
      process.chdir(root);
      await setupCommand({ preset: 'marketing', envFile: true });

      const env = readFileSync(join(root, '.env.local'), 'utf8');
      const schema = readFileSync(join(root, 'src/lib/db/schema.ts'), 'utf8');
      const schemaPg = readFileSync(join(root, 'src/lib/db/schema-pg.ts'), 'utf8');
      const navigation = readFileSync(join(root, 'src/config/navigation.ts'), 'utf8');
      const proxy = readFileSync(join(root, 'src/proxy.ts'), 'utf8');
      const mcp = JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')) as {
        mcpServers: { codapult: { args: string[] } };
      };

      expect(env).toContain('APP_MODE=landing');
      expect(env).toContain('AUTH_PROVIDER=none');
      expect(env).toContain('ENABLE_AI=false');
      expect(schema).not.toContain('featureRequest');
      expect(schema).not.toContain('experiment');
      expect(schema).not.toContain('aiPrompt');
      expect(schemaPg).not.toContain('aiPrompt');
      expect(schemaPg).not.toContain('agentId');
      expect(navigation).not.toContain('/dashboard/ai');
      expect(navigation).toContain('/dashboard');
      expect(proxy).not.toContain('/api/ai');
      expect(existsSync(reportsDir)).toBe(false);
      expect(mcp.mcpServers.codapult.args).toEqual(['-y', '@codapult/cli@latest', 'mcp-server']);
    } finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
