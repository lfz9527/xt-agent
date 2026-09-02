import { describe, expect, it, vi } from 'vitest';
import { RunRuntime } from './run-runtime';
import type { LoopRuntimeState, StateStore } from './kernel';
import type { PolicySnapshot } from './enforcement';

const snapshot = (runId: string, revision = 1): PolicySnapshot => ({
  runId,
  policyRevision: revision,
  trust: 'standard',
  permissions: {},
  effectivePolicy: {},
  resolvedAt: new Date().toISOString(),
});

const storeFixture = () => {
  let current: LoopRuntimeState | undefined;
  const store: StateStore = {
    read: () => {
      if (!current) throw new Error('missing state');
      return current;
    },
    write: (next) => { current = next; },
  };
  return { store, get: () => current };
};

describe('RunRuntime', () => {
  it('creates a persisted INIT run with a git baseline and policy snapshot', () => {
    const fixture = storeFixture();
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const runtime = new RunRuntime(() => fixture.store, policy, { createRunId: () => 'run-1' });

    const state = runtime.createRun();

    expect(state.runId).toBe('run-1');
    expect(state.status).toBe('INIT');
    expect(state.policyRevision).toBe(1);
    expect(state.snapshot.runId).toBe('run-1');
    expect(state.gitBaseline?.commit).toBeTruthy();
    expect(state.expectedWorktreeFingerprint).toBe(state.gitBaseline?.worktreeFingerprint);
    expect(fixture.get()).toEqual(state);
  });

  it('blocks loading a run after the project policy revision changes', () => {
    const fixture = storeFixture();
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const runtime = new RunRuntime(() => fixture.store, policy, { createRunId: () => 'run-1' });
    runtime.createRun();
    policy.currentRevision.mockReturnValue(2);

    expect(() => runtime.loadRun('run-1')).toThrow('[LOOP_BLOCKED] policy revision mismatch; run must not resume');
  });

  it('pauses a live run and rejects pausing terminal states', () => {
    const fixture = storeFixture();
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const runtime = new RunRuntime(() => fixture.store, policy, { createRunId: () => 'run-1' });
    runtime.createRun();

    const paused = runtime.pause('run-1');
    expect(paused.status).toBe('PAUSED');
    expect(paused.facts.resumeStateValid).toBe(true);

    fixture.store.write({ ...paused, status: 'DONE' });
    expect(() => runtime.pause('run-1')).toThrow('[LOOP_BLOCKED] run in DONE cannot be paused');
  });

  it('marks a paused run as resume-requested without bypassing the transition guard', () => {
    const fixture = storeFixture();
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const runtime = new RunRuntime(() => fixture.store, policy, { createRunId: () => 'run-1' });
    runtime.createRun();
    runtime.pause('run-1');

    const resumed = runtime.resume('run-1');
    expect(resumed.status).toBe('PAUSED');
    expect(resumed.facts.resumeRequested).toBe(true);
    expect(resumed.facts.resumeStateValid).toBe(true);
  });

  it('requires every completion acceptance gate before DONE', () => {
    const fixture = storeFixture();
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const runtime = new RunRuntime(() => fixture.store, policy, { createRunId: () => 'run-1' });
    runtime.createRun();
    fixture.store.write({
      ...fixture.get()!,
      status: 'READY_FOR_CONFIRMATION',
      facts: {
        ...fixture.get()!.facts,
        acceptancePassed: true,
        verificationPassed: true,
        reviewPassed: true,
        finalApprovalSatisfied: true,
      },
    });

    expect(runtime.complete('run-1').status).toBe('DONE');
  });
});
