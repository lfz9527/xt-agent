import type { RuntimeAuditEvent } from '../runtime/persistence';
import type { RunAuditTimeline } from '../runtime/audit-timeline';
import type { RuntimeAuditReplay } from '../runtime/audit-replay';

export type RunEventObserver = (event: RuntimeAuditEvent) => void;

export interface RunEventObserverPort {
  list(runId: string): RuntimeAuditEvent[];
  subscribe(runId: string, observer: RunEventObserver): () => void;
}

/**
 * P2-11 Adapter：只读观察 Run Event。
 * Observer 可以查询历史事件或订阅运行中的事件，但不能修改 Runtime State。
 */
export class RuntimeRunEventObserver implements RunEventObserverPort {
  constructor(
    private readonly timeline: RunAuditTimeline,
    private readonly replay: Pick<RuntimeAuditReplay, 'read'>,
  ) {}

  list(runId: string): RuntimeAuditEvent[] {
    return this.replay.read(runId);
  }

  subscribe(runId: string, observer: RunEventObserver): () => void {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for event observation');
    if (typeof observer !== 'function') throw new Error('[LOOP_BLOCKED] event observer must be a function');
    return this.timeline.subscribe(runId, observer);
  }
}
