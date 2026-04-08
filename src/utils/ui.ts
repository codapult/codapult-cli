import pc from 'picocolors';
import { createInterface } from 'node:readline';

export const symbols = {
  check: pc.green('✓'),
  cross: pc.red('✗'),
  warn: pc.yellow('!'),
  info: pc.blue('ℹ'),
  arrow: pc.cyan('→'),
  dot: pc.dim('·'),
} as const;

export function heading(text: string): void {
  console.log();
  console.log(pc.bold(pc.cyan(`  ${text}`)));
  console.log(pc.dim(`  ${'─'.repeat(text.length)}`));
  console.log();
}

export function success(text: string): void {
  console.log(`  ${symbols.check} ${text}`);
}

export function fail(text: string): void {
  console.log(`  ${symbols.cross} ${pc.red(text)}`);
}

export function warn(text: string): void {
  console.log(`  ${symbols.warn} ${pc.yellow(text)}`);
}

export function info(text: string): void {
  console.log(`  ${symbols.info} ${text}`);
}

export function dim(text: string): void {
  console.log(pc.dim(`  ${text}`));
}

export function label(key: string, value: string): void {
  console.log(`  ${pc.dim(key + ':')} ${value}`);
}

export function table(rows: Array<[string, string, string?]>): void {
  const maxKey = Math.max(...rows.map((r) => r[0].length));
  const maxVal = Math.max(...rows.map((r) => r[1].length));

  for (const [key, value, status] of rows) {
    const statusStr = status ?? '';
    console.log(`  ${key.padEnd(maxKey)}  ${value.padEnd(maxVal)}  ${statusStr}`);
  }
}

/** Prompt yes/no. Returns default when stdin is not a TTY (piped / CI). */
export function confirm(question: string, defaultYes = true): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return Promise.resolve(defaultYes);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`  ${question} [${hint}]: `, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve(defaultYes);
        return;
      }
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}
