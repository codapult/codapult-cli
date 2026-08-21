import { describe, expect, it } from 'vitest';
import { healthExitCode } from './health-render.js';

describe('healthExitCode', () => {
  it('fails CI only when the health report contains failures', () => {
    expect(
      healthExitCode({
        root: '/',
        status: 'warn',
        checks: [],
        summary: { ok: 0, warnings: 1, failures: 0 },
      }),
    ).toBe(0);
    expect(
      healthExitCode({
        root: '/',
        status: 'fail',
        checks: [],
        summary: { ok: 0, warnings: 0, failures: 1 },
      }),
    ).toBe(1);
  });
});
