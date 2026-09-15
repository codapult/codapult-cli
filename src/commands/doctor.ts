import { checkProjectRoot } from '../utils/project.js';
import { collectProjectHealth } from '../utils/health.js';
import { healthExitCode, renderHealthReport } from '../utils/health-render.js';
import type { ProjectEnvOptions } from '../utils/project-env.js';

export function doctorCommand(options: ProjectEnvOptions = {}): void {
  const root = checkProjectRoot('exit');

  const report = collectProjectHealth(root, {
    envSource: options.envFile === false ? 'process' : 'file',
  });
  renderHealthReport('Codapult Doctor', report);
  process.exitCode = healthExitCode(report);
}
