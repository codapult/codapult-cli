import { describe, expect, it } from 'vitest';
import { buildEnvContent, resolvePreset } from './setup.js';

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
});
