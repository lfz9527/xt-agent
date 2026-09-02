import { RuntimeAuditReplay } from '../runtime/audit-replay';
import { RuntimeReplayReport } from '../runtime/replay-report';
import { RuntimeReplayReportStore } from '../runtime/replay-report-store';
import type { ReplayReport } from '../runtime/replay-report';

export interface ReplayServiceOptions {
  workspace?: string;
  replay?: RuntimeAuditReplay;
  report?: RuntimeReplayReport;
  reportStore?: RuntimeReplayReportStore;
}

/**
 * Adapter-facing service. CLI code never reads Runtime files directly.
 */
export class ReplayService {
  private readonly replay: RuntimeAuditReplay;
  private readonly report: RuntimeReplayReport;
  private readonly reportStore: RuntimeReplayReportStore;

  constructor(options: ReplayServiceOptions = {}) {
    this.replay = options.replay ?? new RuntimeAuditReplay(options.workspace);
    this.report = options.report ?? new RuntimeReplayReport();
    this.reportStore = options.reportStore ?? new RuntimeReplayReportStore(options.workspace);
  }

  execute(runId: string): ReplayReport {
    const result = this.replay.replay(runId);
    const report = this.report.build(result);
    this.reportStore.write(report);
    return report;
  }
}
