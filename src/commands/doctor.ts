import { findProjectRoot } from '../utils/project.js';
import { collectProjectHealth } from '../utils/health.js';
import { fail } from '../utils/ui.js';
import { healthExitCode, renderHealthReport } from '../utils/health-render.js';
import type { ProjectEnvOptions } from '../utils/project-env.js';

export function doctorCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  const report = collectProjectHealth(root, {
    envSource: options.envFile === false ? 'process' : 'file',
  });
  renderHealthReport('Codapult Doctor', report);
  process.exitCode = healthExitCode(report);
}
