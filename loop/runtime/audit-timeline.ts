import type { CompletionEvidence } from './completion-gate';
import type { MutationJournalEntry, RuntimeAuditEvent, RuntimeAuditEventType, RuntimeAuditLog } from './persistence';
import { createRuntimeEventId } from './persistence';

export type AuditTimelineKind = 'stage' | 'checkpoint' | 'evidence' | 'mutation' | 'state';
export interface AuditTimelineEntry { eventId: string; runId: string; kind: AuditTimelineKind; at: string; policyRevision: number; payload: Record<string, unknown>; }

export class RunAuditTimeline {
  constructor(private readonly audit: RuntimeAuditLog) {}
  stage(runId: string, policyRevision: number, stage: string, outcome: 'started' | 'completed' | 'failed'): void { this.append(runId, policyRevision, 'STAGE', { stage, outcome }); }
  checkpoint(runId: string, policyRevision: number, checkpointId: string, stage: string, nextStatus?: string): void { this.append(runId, policyRevision, 'CHECKPOINT', { checkpointId, stage, nextStatus }); }
  evidence(runId: string, policyRevision: number, evidence: CompletionEvidence): void { if (evidence.runId !== runId) throw new Error('[LOOP_BLOCKED] evidence belongs to another run'); this.append(runId, policyRevision, 'EVIDENCE', evidence as unknown as Record<string, unknown>); }
  mutation(entry: MutationJournalEntry, policyRevision: number): void { this.append(entry.runId, policyRevision, 'RESOURCE_MUTATION', entry as unknown as Record<string, unknown>); }
  state(runId: string, policyRevision: number, from: string, to: string): void { this.append(runId, policyRevision, 'STATE_TRANSITION', { from, to }); }
  private append(runId: string, policyRevision: number, type: RuntimeAuditEventType, payload: Record<string, unknown>): void {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for audit timeline');
    if (!Number.isInteger(policyRevision) || policyRevision < 1) throw new Error('[LOOP_BLOCKED] invalid audit timeline policy revision');
    this.audit.append({ eventId: createRuntimeEventId(type.toLowerCase()), runId, type, at: new Date().toISOString(), policyRevision, payload });
  }
}
