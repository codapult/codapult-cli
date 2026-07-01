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

export function table(rows: [string, string, string?][]): void {
  const maxKey = Math.max(...rows.map((r) => r[0].length));
  const maxVal = Math.max(...rows.map((r) => r[1].length));

  for (const [key, value, status] of rows) {
    const statusStr = status ?? '';
    console.log(`  ${key.padEnd(maxKey)}  ${value.padEnd(maxVal)}  ${statusStr}`);
  }
}

export function ask(
  iface: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((res) => {
    iface.question(`  ${question}${suffix}: `, (answer) => {
      res(answer.trim() || defaultValue || '');
    });
  });
}

export function confirm(question: string, defaultYes?: boolean): Promise<boolean>;

export function confirm(
  iface: ReturnType<typeof createInterface>,
  question: string,
  defaultYes?: boolean,
): Promise<boolean>;

/** Prompt yes/no. Returns default when stdin is not a TTY (piped / CI). */
export async function confirm(
  ifaceOrQuestion: ReturnType<typeof createInterface> | string,
  questionOrDefault: string | boolean | undefined,
  defaultYes_?: boolean,
): Promise<boolean> {
  const defaultYes =
    (typeof questionOrDefault !== 'string' ? questionOrDefault : defaultYes_) ?? true;

  if (!process.stdin.isTTY) {
    return Promise.resolve(defaultYes);
  }

  const [rl, question, closeRl] =
    typeof ifaceOrQuestion === 'string'
      ? [createInterface({ input: process.stdin, output: process.stdout }), ifaceOrQuestion, true]
      : [ifaceOrQuestion, String(questionOrDefault), false];

  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(rl, `${question} [${hint}]`);
  if (closeRl) rl.close();
  return !answer ? defaultYes : answer.toLowerCase().startsWith('y');
}
