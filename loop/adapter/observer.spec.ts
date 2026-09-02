import { describe, expect, it } from 'vitest';
import { RuntimeRunEventObserver } from './observer';
import { RunAuditTimeline } from '../runtime/audit-timeline';

const event = (runId: string) => ({
  eventId: 'evt-1', runId, type: 'STAGE' as const, at: new Date().toISOString(), policyRevision: 1,
  payload: { stage: 'PLAN', outcome: 'started' as const },
});

describe('RuntimeRunEventObserver', () => {
  it('lists persisted events through replay and subscribes to live timeline events', () => {
    const persisted = event('run-1');
    const replay = { read: (runId: string) => runId === 'run-1' ? [persisted] : [] };
    const audit = { append: (_event: typeof persisted) => undefined };
    const timeline = new RunAuditTimeline(audit);
    const observer = new RuntimeRunEventObserver(timeline, replay);
    const received: string[] = [];

    expect(observer.list('run-1')).toEqual([persisted]);
    const unsubscribe = observer.subscribe('run-1', (next) => received.push(next.eventId));
    timeline.stage('run-1', 1, 'PLAN', 'started');
    unsubscribe();
    timeline.stage('run-1', 1, 'PLAN', 'completed');

    expect(received).toEqual([expect.any(String)]);
  });

  it('isolates subscriptions by run', () => {
    const audit = { append: (_event: ReturnType<typeof event>) => undefined };
    const timeline = new RunAuditTimeline(audit);
    const observer = new RuntimeRunEventObserver(timeline, { read: () => [] });
    const received: string[] = [];
    observer.subscribe('run-1', (next) => received.push(next.runId));
    timeline.stage('run-2', 1, 'PLAN', 'started');
    expect(received).toEqual([]);
  });

  it('does not expose runtime state mutation', () => {
    const observer = new RuntimeRunEventObserver(new RunAuditTimeline({ append: () => undefined }), { read: () => [] });
    expect('state' in observer).toBe(false);
    expect('transition' in observer).toBe(false);
  });

  it('blocks invalid subscription input', () => {
    const observer = new RuntimeRunEventObserver(new RunAuditTimeline({ append: () => undefined }), { read: () => [] });
    expect(() => observer.subscribe('', () => undefined)).toThrow('[LOOP_BLOCKED] runId is required for event observation');
    expect(() => observer.subscribe('run-1', null as never)).toThrow('[LOOP_BLOCKED] event observer must be a function');
  });
});
