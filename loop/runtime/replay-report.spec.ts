import { describe, expect, it } from 'vitest';
import type { AuditReplayResult } from './audit-replay';
import { RuntimeReplayReport } from './replay-report';

const result: AuditReplayResult = {
  runId: 'run-1',
  finalStatus: 'READY_FOR_CONFIRMATION',
  policyRevisions: [1, 2],
  transitions: [],
  events: [
    { eventId: '1', runId: 'run-1', type: 'STAGE', at: '2026-09-02T00:00:00.000Z', policyRevision: 1, payload: { stage: 'IMPLEMENT', outcome: 'completed' } },
    { eventId: '2', runId: 'run-1', type: 'CHECKPOINT', at: '2026-09-02T00:01:00.000Z', policyRevision: 1, payload: { checkpointId: 'cp-1', stage: 'VERIFY' } },
    { eventId: '3', runId: 'run-1', type: 'EVIDENCE', at: '2026-09-02T00:02:00.000Z', policyRevision: 2, payload: { id: 'ev-1', status: 'passed' } },
    { eventId: '4', runId: 'run-1', type: 'RESOURCE_MUTATION', at: '2026-09-02T00:03:00.000Z', policyRevision: 2, payload: { mutationId: 'mut-1', result: 'committed' } },
    { eventId: '5', runId: 'run-1', type: 'STATE_TRANSITION', at: '2026-09-02T00:04:00.000Z', policyRevision: 2, payload: { from: 'VERIFY', to: 'READY_FOR_CONFIRMATION' } },
  ],
};

describe('RuntimeReplayReport', () => {
  it('builds a complete ordered Run timeline and event counts', () => {
    const report = new RuntimeReplayReport().build(result);
    expect(report.runId).toBe('run-1');
    expect(report.finalStatus).toBe('READY_FOR_CONFIRMATION');
    expect(report.policyRevisions).toEqual([1, 2]);
    expect(report.entries.map((entry) => entry.type)).toEqual([
      'STAGE', 'CHECKPOINT', 'EVIDENCE', 'RESOURCE_MUTATION', 'STATE_TRANSITION',
    ]);
    expect(report.entries.map((entry) => entry.summary)).toEqual([
      'stage IMPLEMENT completed',
      'checkpoint cp-1 at VERIFY',
      'evidence ev-1 passed',
      'mutation mut-1 committed',
      'state VERIFY -> READY_FOR_CONFIRMATION',
    ]);
    expect(report.counts.STAGE).toBe(1);
    expect(report.counts.CHECKPOINT).toBe(1);
    expect(report.counts.EVIDENCE).toBe(1);
    expect(report.counts.RESOURCE_MUTATION).toBe(1);
    expect(report.counts.STATE_TRANSITION).toBe(1);
  });
});
