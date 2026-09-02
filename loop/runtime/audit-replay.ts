import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeAuditEvent } from './persistence';

export interface ReplayTransition {
  eventId: string;
  runId: string;
  from: string;
  to: string;
  at: string;
  policyRevision: number;
}

export interface AuditReplayResult {
  runId: string;
  events: RuntimeAuditEvent[];
  transitions: ReplayTransition[];
  finalStatus?: string;
  policyRevisions: number[];
}

/**
 * P2-5 audit replay: reconstruct a Run's observable state-transition timeline
 * from the append-only runtime history without executing the Agent again.
 */
export class RuntimeAuditReplay {
  constructor(private readonly workspace: string = '.loop') {}

  read(runId: string): RuntimeAuditEvent[] {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for audit replay');
    const path = join(this.workspace, 'runtime', 'history.jsonl');
    if (!existsSync(path)) return [];

    const events: RuntimeAuditEvent[] = [];
    for (const [index, line] of readFileSync(path, 'utf8').split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let event: RuntimeAuditEvent;
      try {
        event = JSON.parse(line) as RuntimeAuditEvent;
      } catch {
        throw new Error(`[LOOP_BLOCKED] audit history contains invalid JSON at line ${index + 1}`);
      }
      this.validateEvent(event, index + 1);
      if (event.runId === runId) events.push(event);
    }
    return events;
  }

  replay(runId: string): AuditReplayResult {
    const events = this.read(runId);
    const transitions: ReplayTransition[] = [];
    let finalStatus: string | undefined;
    const policyRevisions = [...new Set(events.map((event) => event.policyRevision))];

    for (const event of events) {
      if (event.type !== 'STATE_TRANSITION') continue;
      const from = this.stringPayload(event, 'from');
      const to = this.stringPayload(event, 'to');
      if (finalStatus !== undefined && from !== finalStatus) {
        throw new Error(`[LOOP_BLOCKED] audit transition chain is inconsistent: expected ${finalStatus}, got ${from}`);
      }
      transitions.push({ eventId: event.eventId, runId: event.runId, from, to, at: event.at, policyRevision: event.policyRevision });
      finalStatus = to;
    }

    return { runId, events, transitions, finalStatus, policyRevisions };
  }

  private validateEvent(event: RuntimeAuditEvent, line: number): void {
    if (!event || typeof event !== 'object') throw new Error(`[LOOP_BLOCKED] invalid audit event at line ${line}`);
    if (!event.eventId?.trim() || !event.runId?.trim() || !event.type || !event.at) {
      throw new Error(`[LOOP_BLOCKED] incomplete audit event at line ${line}`);
    }
    if (!Number.isInteger(event.policyRevision) || event.policyRevision < 1) {
      throw new Error(`[LOOP_BLOCKED] invalid audit policy revision at line ${line}`);
    }
    if (!event.payload || typeof event.payload !== 'object') {
      throw new Error(`[LOOP_BLOCKED] invalid audit payload at line ${line}`);
    }
  }

  private stringPayload(event: RuntimeAuditEvent, key: string): string {
    const value = event.payload[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`[LOOP_BLOCKED] audit transition is missing ${key}`);
    }
    return value;
  }
}
