import { dim, fail, heading, success, warn } from './ui.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface ReportCheck {
  id: string;
  status: CheckStatus;
  message: string;
  path?: string;
}

export interface StructuredReport {
  status: CheckStatus;
  checks: ReportCheck[];
  summary: { ok: number; warnings: number; failures: number };
}

export function summarizeChecks(checks: ReportCheck[]): StructuredReport {
  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warnings: checks.filter((check) => check.status === 'warn').length,
    failures: checks.filter((check) => check.status === 'fail').length,
  };
  return {
    status: summary.failures > 0 ? 'fail' : summary.warnings > 0 ? 'warn' : 'ok',
    checks,
    summary,
  };
}

export function renderStructuredReport(title: string, report: StructuredReport): void {
  heading(title);
  for (const check of report.checks) {
    if (check.status === 'ok') success(check.message);
    else if (check.status === 'fail') fail(check.message);
    else warn(check.message);
    if (check.status !== 'ok' && check.path) dim(`  Path: ${check.path}`);
  }
  if (report.summary.failures > 0) fail(`${report.summary.failures} issue(s) found`);
  if (report.summary.warnings > 0) warn(`${report.summary.warnings} warning(s)`);
}
