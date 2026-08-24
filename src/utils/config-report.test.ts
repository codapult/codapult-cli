import { describe, expect, it, vi } from 'vitest';

vi.mock('./project.js', () => ({ readProjectFile: vi.fn() }));

const { readProjectFile } = await import('./project.js');
const { collectAppConfigSummary } = await import('./config-report.js');

describe('collectAppConfigSummary', () => {
  it('returns the shared displayable app config subset', () => {
    vi.mocked(readProjectFile).mockReturnValue(`
      export const appConfig = {
        brand: { name: 'Codapult', description: 'Starter', logo: '/logo.svg' },
        company: { contactEmail: 'hello@example.com', githubUrl: 'https://github.com/codapult' },
      };
    `);
    expect(collectAppConfigSummary('/project')).toEqual({
      brand: { name: 'Codapult', description: 'Starter', logo: '/logo.svg' },
      company: { contactEmail: 'hello@example.com', githubUrl: 'https://github.com/codapult' },
    });
  });
});
