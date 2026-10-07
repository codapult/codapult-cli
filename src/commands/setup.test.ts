import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEnvContent, resolvePreset, setupCommand } from './setup.js';

describe('setup presets', () => {
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

  it('keeps app mode for custom presets by default', () => {
    expect(resolvePreset('enableAI=false').appMode).toBe('app');
  });

  it('writes the selected app mode into generated env content', () => {
    const marketing = buildEnvContent('# APP_MODE="demo"\n', resolvePreset('marketing'));
    const demo = buildEnvContent('# APP_MODE="demo"\n', resolvePreset('demo'));

    expect(marketing).toContain('APP_MODE=landing');
    expect(demo).toContain('APP_MODE=demo');
  });

  it('applies the marketing preset to a project fixture', async () => {
    const previousCwd = process.cwd();
    const root = mkdtempSync(join(tmpdir(), 'codapult-setup-'));
    const reportsDir = join(root, 'src/app/[locale]/(protected)/(dashboard)/dashboard/reports');

    mkdirSync(join(root, 'src/config'), { recursive: true });
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'codapult' }));
    writeFileSync(join(root, 'src/config/app.ts'), 'export const appConfig = {} as const;\n');
    writeFileSync(join(root, '.env.example'), 'APP_MODE="app"\nNEXT_PUBLIC_APP_NAME="Codapult"\n');
    writeFileSync(
      join(reportsDir, 'page.tsx'),
      'export default function Reports() { return null; }\n',
    );

    try {
      process.chdir(root);
      await setupCommand({ preset: 'marketing', envFile: true });

      const env = readFileSync(join(root, '.env.local'), 'utf8');
      const mcp = JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')) as {
        mcpServers: { codapult: { args: string[] } };
      };

      expect(env).toContain('APP_MODE=landing');
      expect(env).toContain('AUTH_PROVIDER=none');
      expect(env).toContain('ENABLE_AI_CORE=false');
      expect(existsSync(reportsDir)).toBe(false);
      expect(mcp.mcpServers.codapult.args).toEqual(['-y', '@codapult/cli@latest', 'mcp-server']);
    } finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
