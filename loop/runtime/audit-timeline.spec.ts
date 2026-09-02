import { describe, expect, it } from 'vitest';
import type { RuntimeAuditEvent, RuntimeAuditLog } from './persistence';
import { RunAuditTimeline } from './audit-timeline';

function log() {
  const events: RuntimeAuditEvent[] = [];
  const audit: RuntimeAuditLog = { append: (event) => events.push(event) };
  return { audit, events };
}

describe('RunAuditTimeline', () => {
  it('records stage, checkpoint, evidence, mutation and state in one ordered audit stream', () => {
    const h = log();
    const timeline = new RunAuditTimeline(h.audit);
    timeline.stage('run-1', 2, 'IMPLEMENT', 'started');
    timeline.checkpoint('run-1', 2, 'cp-1', 'IMPLEMENT', 'VERIFY');
    timeline.evidence('run-1', 2, { id: 'ev-1', runId: 'run-1', criterion: 'tests', status: 'passed', confidence: 'high' });
    timeline.mutation({ mutationId: 'mut-1', runId: 'run-1', resource: 'src/a.ts', capability: 'write', at: new Date().toISOString(), beforeWorktreeFingerprint: 'a', afterWorktreeFingerprint: 'b', result: 'committed' }, 2);
    timeline.state('run-1', 2, 'IMPLEMENT', 'VERIFY');

    expect(h.events.map((e) => e.type)).toEqual(['STAGE', 'CHECKPOINT', 'EVIDENCE', 'RESOURCE_MUTATION', 'STATE_TRANSITION']);
    expect(h.events.every((e) => e.runId === 'run-1' && e.policyRevision === 2)).toBe(true);
    expect(h.events.map((e) => e.eventId)).toEqual([
      expect.stringMatching(/^stage-/),
      expect.stringMatching(/^checkpoint-/),
      expect.stringMatching(/^evidence-/),
      expect.stringMatching(/^resource_mutation-/),
      expect.stringMatching(/^state_transition-/),
    ]);
  });

  it('keeps structured payloads intact and does not encode non-state events as transitions', () => {
    const h = log();
    const timeline = new RunAuditTimeline(h.audit);
    timeline.stage('run-1', 2, 'VERIFY', 'completed');
    timeline.checkpoint('run-1', 2, 'cp-2', 'VERIFY');
    timeline.evidence('run-1', 2, { id: 'ev-2', runId: 'run-1', criterion: 'tests', status: 'passed', confidence: 'high' });

    expect(h.events[0]?.payload).toEqual({ stage: 'VERIFY', outcome: 'completed' });
    expect(h.events[1]?.payload).toEqual({ checkpointId: 'cp-2', stage: 'VERIFY', nextStatus: undefined });
    expect(h.events[2]?.payload).toEqual({ id: 'ev-2', runId: 'run-1', criterion: 'tests', status: 'passed', confidence: 'high' });
    expect(h.events.every((e) => e.type !== 'STATE_TRANSITION')).toBe(true);
  });

  it('blocks cross-run evidence', () => {
    const h = log();
    expect(() => new RunAuditTimeline(h.audit).evidence('run-1', 1, { id: 'ev-1', runId: 'run-2', criterion: 'tests', status: 'passed', confidence: 'high' })).toThrow('[LOOP_BLOCKED] evidence belongs to another run');
    expect(h.events).toHaveLength(0);
  });

  it('rejects missing run ids and invalid policy revisions before writing', () => {
    const h = log();
    const timeline = new RunAuditTimeline(h.audit);
    expect(() => timeline.stage(' ', 1, 'PLAN', 'started')).toThrow('[LOOP_BLOCKED] runId is required for audit timeline');
    expect(() => timeline.stage('run-1', 0, 'PLAN', 'started')).toThrow('[LOOP_BLOCKED] invalid audit timeline policy revision');
    expect(h.events).toHaveLength(0);
  });
});
