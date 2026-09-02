import type { RuntimeAuditEvent } from './persistence';
import type { AuditReplayResult } from './audit-replay';

export interface ReplayReportEntry {
  eventId: string;
  runId: string;
  at: string;
  policyRevision: number;
  type: RuntimeAuditEvent['type'];
  summary: string;
  payload: Record<string, unknown>;
}

export interface ReplayReport {
  runId: string;
  finalStatus?: string;
  policyRevisions: number[];
  entries: ReplayReportEntry[];
  counts: Record<RuntimeAuditEvent['type'], number>;
}

/**
 * P2-5 replay report: turns the append-only audit stream into a stable,
 * human-readable Run timeline without executing any side effects.
 */
export class RuntimeReplayReport {
  build(result: AuditReplayResult): ReplayReport {
    const counts = {} as ReplayReport['counts'];
    const entries = result.events.map((event) => {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
      return {
        eventId: event.eventId,
        runId: event.runId,
        at: event.at,
        policyRevision: event.policyRevision,
        type: event.type,
        summary: this.summary(event),
        payload: event.payload,
      };
    });

    return {
      runId: result.runId,
      finalStatus: result.finalStatus,
      policyRevisions: result.policyRevisions,
      entries,
      counts,
    };
  }

  private summary(event: RuntimeAuditEvent): string {
    switch (event.type) {
      case 'STAGE': return `stage ${String(event.payload.stage)} ${String(event.payload.outcome)}`;
      case 'CHECKPOINT': return `checkpoint ${String(event.payload.checkpointId)} at ${String(event.payload.stage)}`;
      case 'EVIDENCE': return `evidence ${String(event.payload.id)} ${String(event.payload.status)}`;
      case 'RESOURCE_MUTATION': return `mutation ${String(event.payload.mutationId)} ${String(event.payload.result)}`;
      case 'STATE_TRANSITION': return `state ${String(event.payload.from)} -> ${String(event.payload.to)}`;
      case 'APPROVAL_REQUESTED': return `approval requested ${String(event.payload.gate ?? event.payload.capability ?? '')}`.trim();
      case 'APPROVAL_RESOLVED': return `approval resolved ${String(event.payload.decision ?? '')}`.trim();
      case 'BLOCKED': return `blocked ${String(event.payload.reason ?? '')}`.trim();
    }
  }
}
