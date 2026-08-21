import type { ProjectHealthReport } from './health.js';
import { dim, fail, heading, label, success, warn } from './ui.js';

export function healthExitCode(report: ProjectHealthReport): number {
  return report.summary.failures > 0 ? 1 : 0;
}

export function renderHealthReport(title: string, report: ProjectHealthReport): void {
  heading(title);
  label('Project root', report.root);
  console.log();

  for (const check of report.checks) {
    if (check.status === 'ok') success(check.message);
    else if (check.status === 'fail') fail(check.message);
    else warn(check.message);
    if (check.status !== 'ok' && check.path) dim(`  Path: ${check.path}`);
  }

  console.log();
  if (report.status === 'ok') success('Everything looks good!');
  else {
    if (report.summary.failures > 0) fail(`${report.summary.failures} issue(s) found`);
    if (report.summary.warnings > 0) warn(`${report.summary.warnings} warning(s)`);
  }
}
