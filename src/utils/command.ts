import { execSync } from 'node:child_process';

export interface CommandResult {
  command: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runProjectCommand(
  command: string,
  cwd: string,
  options: { timeout?: number; env?: NodeJS.ProcessEnv } = {},
): CommandResult {
  try {
    const stdout = execSync(command, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: 'pipe',
      timeout: options.timeout ?? 120_000,
    }).toString();
    return { command, passed: true, exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    const execError = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const exitCode = execError.status ?? 1;
    return {
      command,
      passed: exitCode === 0,
      exitCode,
      stdout: execError.stdout?.toString() ?? '',
      stderr: execError.stderr?.toString() ?? '',
    };
  }
}

export function commandResponse(result: CommandResult): {
  content: { type: 'text'; text: string }[];
  isError: boolean;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.passed,
  };
}
