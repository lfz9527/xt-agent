import { describe, expect, it } from 'vitest';
import type { ReplayReport } from '../runtime/replay-report';
import { formatReplayReport, runReplayCommand } from './replay';
import { runCli } from './index';

const report: ReplayReport = {
  runId: 'run-1',
  finalStatus: 'DONE',
  policyRevisions: [1],
  entries: [
    {
      eventId: 'evt-1',
      runId: 'run-1',
      at: '2026-09-02T10:00:00Z',
      policyRevision: 1,
      type: 'STATE_TRANSITION',
      summary: 'state INIT -> GOAL_REVIEW',
      payload: { from: 'INIT', to: 'GOAL_REVIEW' },
    },
  ],
  counts: { STATE_TRANSITION: 1 } as ReplayReport['counts'],
};

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: { write: (chunk: string) => out.push(chunk) },
    stderr: { write: (chunk: string) => err.push(chunk) },
  };
}

describe('Loop replay CLI adapter', () => {
  it('blocks a missing run id', () => {
    const ioState = io();
    expect(runReplayCommand([], ioState).exitCode).toBe(2);
    expect(ioState.err.join('')).toContain('[LOOP_BLOCKED] runId is required');
  });

  it('renders a human-readable report', () => {
    const ioState = io();
    const service = { execute: () => report };
    expect(runReplayCommand(['run-1'], { ...ioState, service }).exitCode).toBe(0);
    expect(ioState.out.join('')).toContain('Run: run-1');
    expect(ioState.out.join('')).toContain('state INIT -> GOAL_REVIEW');
  });

  it('renders machine-readable JSON when requested', () => {
    const ioState = io();
    const service = { execute: () => report };
    expect(runReplayCommand(['run-1', '--json'], { ...ioState, service }).exitCode).toBe(0);
    expect(JSON.parse(ioState.out.join(''))).toEqual(report);
  });

  it('propagates blocked Runtime errors as a non-zero exit', () => {
    const ioState = io();
    const service = { execute: () => { throw new Error('[LOOP_BLOCKED] replay history is invalid'); } };
    expect(runReplayCommand(['run-1'], { ...ioState, service }).exitCode).toBe(1);
    expect(ioState.err.join('')).toContain('[LOOP_BLOCKED] replay history is invalid');
  });

  it('keeps unsupported commands outside the Runtime', () => {
    const ioState = io();
    expect(runCli(['run'])).toBe(2);
  });

  it('formats an empty timeline without inventing events', () => {
    expect(formatReplayReport({ ...report, entries: [] })).not.toContain('undefined');
  });
});
