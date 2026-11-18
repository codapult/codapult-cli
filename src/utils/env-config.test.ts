import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getFeatures } from './env-config.js';
import { writeProjectEnvSources } from './test-project-env.js';

const projectRoot = mkdtempSync(join(tmpdir(), 'codapult-env-config-'));
writeProjectEnvSources(projectRoot);

afterAll(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('getFeatures', () => {
  it('mirrors landing-mode feature defaults', () => {
    const features = getFeatures('APP_MODE=landing\nAUTH_PROVIDER=none\n', projectRoot);

    expect(features).toMatchObject({
      docs: true,
      blog: true,
      promotions: true,
      plugins: true,
      compare: true,
      seo: true,
      ai: false,
      aiChat: false,
      aiRag: false,
      teams: false,
      analytics: false,
      workflows: false,
    });
  });

  it('mirrors full-mode feature defaults', () => {
    const features = getFeatures('APP_MODE=full\nAUTH_PROVIDER=better-auth\n', projectRoot);

    expect(features).toMatchObject({
      docs: true,
      blog: true,
      promotions: true,
      plugins: true,
      compare: false,
      seo: false,
      ai: true,
      aiChat: true,
      aiRag: false,
      teams: true,
      analytics: true,
      workflows: true,
    });
  });
});
