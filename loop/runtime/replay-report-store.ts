import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayReport } from './replay-report';

/**
 * Persists the derived P2-5 replay report as a Run-scoped artifact.
 * The authoritative source remains history.jsonl; this file is a materialized
 * report for inspection and tooling, not a second source of truth.
 */
export class RuntimeReplayReportStore {
  constructor(private readonly workspace: string = '.loop') {}

  path(runId: string): string {
    this.validateRunId(runId);
    return join(this.workspace, 'runtime', 'runs', runId, 'replay-report.json');
  }

  write(report: ReplayReport): string {
    const path = this.path(report.runId);
    const directory = join(this.workspace, 'runtime', 'runs', report.runId);
    mkdirSync(directory, { recursive: true });

    const temporaryPath = `${path}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
    return path;
  }

  read(runId: string): ReplayReport | undefined {
    const path = this.path(runId);
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as ReplayReport;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`[LOOP_BLOCKED] replay report is invalid: ${path}`);
    }
  }

  private validateRunId(runId: string): void {
    if (!runId.trim() || runId !== runId.trim() || runId === '.' || runId === '..' || /[\\/]/.test(runId)) {
      throw new Error('[LOOP_BLOCKED] invalid runId for replay report');
    }
  }
}
