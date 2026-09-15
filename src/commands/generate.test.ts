import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs');
vi.mock('../utils/project.js', async (importOriginal) => ({
  findProjectRoot: vi.fn(),
  checkProjectRoot: vi.fn(
    (await importOriginal<typeof import('../utils/project.js')>()).checkProjectRoot,
  ),
}));
vi.mock('../utils/ui.js', () => ({
  heading: vi.fn(),
  success: vi.fn(),
  fail: vi.fn(),
  info: vi.fn(),
  dim: vi.fn(),
}));

const { existsSync, writeFileSync, mkdirSync } = await import('node:fs');
const { checkProjectRoot, findProjectRoot } = await import('../utils/project.js');
const { generatePageCommand, generateApiCommand, generateActionCommand, generatePluginCommand } =
  await import('./generate.js');

const mockedFindRoot = vi.mocked(findProjectRoot);
const mockedCheckRoot = vi.mocked(checkProjectRoot);
const mockedExists = vi.mocked(existsSync);
const mockedWrite = vi.mocked(writeFileSync);
const mockedMkdir = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
});

describe('generatePageCommand', () => {
  it('generates a dashboard page file with correct naming', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generatePageCommand('userSettings');

    expect(mockedMkdir).toHaveBeenCalled();
    expect(mockedWrite).toHaveBeenCalledTimes(1);

    const [path, content] = mockedWrite.mock.calls[0] as [string, string, string];
    expect(path).toContain('user-settings/page.tsx');
    expect(content).toContain('UserSettingsPage');
    expect(content).toContain("title: 'User Settings — Codapult'");
    expect(content).toContain('getAppSession');
  });

  it('converts camelCase to kebab-case in path', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generatePageCommand('myDashboard');

    const [path] = mockedWrite.mock.calls[0] as [string, string, string];
    expect(path).toContain('my-dashboard/page.tsx');
  });

  it('does not overwrite existing page', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(true);

    generatePageCommand('analytics');

    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('exits when not in a Codapult project', () => {
    mockedFindRoot.mockReturnValue(undefined);

    expect(() => generatePageCommand('test')).toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe('generateApiCommand', () => {
  it('generates an API route with auth and rate limiting', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generateApiCommand('webhooks');

    const [path, content] = mockedWrite.mock.calls[0] as [string, string, string];
    expect(path).toContain('api/webhooks/route.ts');
    expect(content).toContain('getAppSession');
    expect(content).toContain('checkRateLimit');
    expect(content).toContain('webhooksSchema');
    expect(content).toContain('export async function GET()');
    expect(content).toContain('export async function POST(req: Request)');
  });

  it('converts multi-word names to kebab-case', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generateApiCommand('userBilling');

    const [path, content] = mockedWrite.mock.calls[0] as [string, string, string];
    expect(path).toContain('api/user-billing/route.ts');
    expect(content).toContain('userBillingSchema');
  });
});

describe('generateActionCommand', () => {
  it('generates a server action file', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generateActionCommand('updateProfile');

    const [path, content] = mockedWrite.mock.calls[0] as [string, string, string];
    expect(path).toContain('actions/update-profile.ts');
    expect(content).toContain("'use server'");
    expect(content).toContain('updateProfileSchema');
    expect(content).toContain('updateProfileAction');
    expect(content).toContain('getAppSession');
    expect(content).toContain('checkRateLimit');
    expect(content).toContain("revalidatePath('/dashboard/update-profile')");
  });
});

describe('generatePluginCommand', () => {
  it('scaffolds a complete plugin directory', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generatePluginCommand('my-widget');

    // package.json, tsconfig.json, src/index.ts, codapult-plugin.json, .gitignore, README.md
    expect(mockedWrite).toHaveBeenCalledTimes(6);
    expect(mockedMkdir).toHaveBeenCalled();

    const writtenPaths = mockedWrite.mock.calls.map(([p]) => p as string);
    expect(writtenPaths.some((p) => p.includes('package.json'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('src/index.ts'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('codapult-plugin.json'))).toBe(true);
  });

  it('generates correct plugin name references', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(false);

    generatePluginCommand('dataSync');

    const indexWrite = mockedWrite.mock.calls.find(([p]) => (p as string).includes('src/index.ts'));
    expect(indexWrite).toBeDefined();
    const content = indexWrite![1] as string;
    expect(content).toContain('dataSyncPlugin');
    expect(content).toContain("name: 'data-sync'");
    expect(content).toContain("label: 'DataSync'");
  });

  it('exits when target directory already exists', () => {
    mockedCheckRoot.mockReturnValue('/project');
    mockedExists.mockReturnValue(true);

    expect(() => generatePluginCommand('existing')).toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
