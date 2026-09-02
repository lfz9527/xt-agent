import type { ReplayReport } from '../runtime/replay-report';
import { ReplayService } from './service';

export interface ReplayCliOptions {
  service?: Pick<ReplayService, 'execute'>;
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
}

export interface ReplayCliResult {
  exitCode: number;
}

export function runReplayCommand(args: string[], options: ReplayCliOptions = {}): ReplayCliResult {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const service = options.service ?? new ReplayService();
  const json = args.includes('--json');
  const runId = args.find((arg) => !arg.startsWith('--'));

  if (!runId) {
    stderr.write('[LOOP_BLOCKED] runId is required\n');
    return { exitCode: 2 };
  }

  if (args.filter((arg) => arg === '--json').length > 1 || args.some((arg) => arg.startsWith('--') && arg !== '--json')) {
    stderr.write('[LOOP_BLOCKED] invalid replay options\n');
    return { exitCode: 2 };
  }

  try {
    const report = service.execute(runId);
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatReplayReport(report));
    return { exitCode: 0 };
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

export function formatReplayReport(report: ReplayReport): string {
  const lines = [
    `Run: ${report.runId}`,
    `Final Status: ${report.finalStatus ?? 'UNKNOWN'}`,
    `Policy Revisions: ${report.policyRevisions.join(', ') || 'none'}`,
    '',
    'Timeline',
    '────────────────────────────────',
  ];

  for (const entry of report.entries) {
    lines.push(`${entry.at}  ${entry.type}`);
    lines.push(`          ${entry.summary}`);
  }

  return `${lines.join('\n')}\n`;
}
