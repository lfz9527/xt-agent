import type { CompletionEvidence } from './completion-gate';
import type { MutationJournalEntry, RuntimeAuditEvent, RuntimeAuditEventType, RuntimeAuditLog } from './persistence';
import { createRuntimeEventId } from './persistence';

export type AuditTimelineKind = 'stage' | 'checkpoint' | 'evidence' | 'mutation' | 'state';
export interface AuditTimelineEntry { eventId: string; runId: string; kind: AuditTimelineKind; at: string; policyRevision: number; payload: Record<string, unknown>; }
export type AuditTimelineObserver = (event: RuntimeAuditEvent) => void;

export class RunAuditTimeline {
  private readonly observers = new Map<string, Set<AuditTimelineObserver>>();

  constructor(private readonly audit: RuntimeAuditLog) {}
  stage(runId: string, policyRevision: number, stage: string, outcome: 'started' | 'completed' | 'failed'): void { this.append(runId, policyRevision, 'STAGE', { stage, outcome }); }
  checkpoint(runId: string, policyRevision: number, checkpointId: string, stage: string, nextStatus?: string): void { this.append(runId, policyRevision, 'CHECKPOINT', { checkpointId, stage, nextStatus }); }
  evidence(runId: string, policyRevision: number, evidence: CompletionEvidence): void { if (evidence.runId !== runId) throw new Error('[LOOP_BLOCKED] evidence belongs to another run'); this.append(runId, policyRevision, 'EVIDENCE', evidence as unknown as Record<string, unknown>); }
  mutation(entry: MutationJournalEntry, policyRevision: number): void { this.append(entry.runId, policyRevision, 'RESOURCE_MUTATION', entry as unknown as Record<string, unknown>); }
  state(runId: string, policyRevision: number, from: string, to: string): void { this.append(runId, policyRevision, 'STATE_TRANSITION', { from, to }); }

  subscribe(runId: string, observer: AuditTimelineObserver): () => void {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for audit observation');
    if (typeof observer !== 'function') throw new Error('[LOOP_BLOCKED] audit observer must be a function');
    let observers = this.observers.get(runId);
    if (!observers) { observers = new Set(); this.observers.set(runId, observers); }
    observers.add(observer);
    return () => {
      observers?.delete(observer);
      if (observers?.size === 0) this.observers.delete(runId);
    };
  }

  private append(runId: string, policyRevision: number, type: RuntimeAuditEventType, payload: Record<string, unknown>): void {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for audit timeline');
    if (!Number.isInteger(policyRevision) || policyRevision < 1) throw new Error('[LOOP_BLOCKED] invalid audit timeline policy revision');
    const event: RuntimeAuditEvent = { eventId: createRuntimeEventId(type.toLowerCase()), runId, type, at: new Date().toISOString(), policyRevision, payload };
    this.audit.append(event);
    for (const observer of this.observers.get(runId) ?? []) observer(event);
  }
}
