import { describe, expect, it, vi } from 'vitest';
import { ExecutionRuntime, type StageExecutor } from './execution-runtime';
import type { LoopRuntimeState, LoopRuntimeKernel, StateStore } from './kernel';
import type { RunRuntime } from './run-runtime';

function state(status: string, facts: Partial<LoopRuntimeState['facts']> = {}): LoopRuntimeState {
  return {
    runId: 'run-1',
    status,
    policyRevision: 1,
    snapshot: { runId: 'run-1', policyRevision: 1, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: new Date().toISOString() },
    facts: {
      executionApprovalSatisfied: true, planArtifactExists: true, implementationCompleted: true,
      verificationPassed: true, verificationFailed: false, reviewPassed: true, reviewFailed: false,
      acceptancePassed: true, finalApprovalSatisfied: true, finalApprovalRejected: false,
      fixAttempts: 0, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: true, pauseExpired: false,
      ...facts,
    },
  };
}

function harness(initial: LoopRuntimeState, results: Record<string, Partial<LoopRuntimeState['facts']>> = {}, maxFixAttempts = 3) {
  let current = initial;
  const store: StateStore = { read: () => current, write: (next) => { current = next; } };
  const runs = { loadRun: vi.fn(() => current) } as unknown as RunRuntime;
  const kernel = { transition: vi.fn((to: string) => { current = { ...current, status: to }; }) } as unknown as LoopRuntimeKernel;
  const executor: StageExecutor = { execute: vi.fn(async (stage) => ({ facts: results[stage] ?? {} })) };
  const runtime = new ExecutionRuntime(runs, kernel, () => store, executor, { maxFixAttempts });
  return { runtime, runs, executor, kernel, getState: () => current, setState: (next: LoopRuntimeState) => { current = next; } };
}

describe('ExecutionRuntime', () => {
  it('advances one stage and checkpoints facts before transition', async () => {
    const h = harness(state('PLAN'));
    await h.runtime.step('run-1');
    expect(h.executor.execute).toHaveBeenCalledWith('PLAN', expect.anything());
    expect(h.kernel.transition).toHaveBeenCalledWith('IMPLEMENT');
    expect(h.getState().status).toBe('IMPLEMENT');
  });

  it('routes failed verification to FIX', async () => {
    const h = harness(state('VERIFY', { verificationPassed: false, verificationFailed: true }));
    await h.runtime.step('run-1');
    expect(h.kernel.transition).toHaveBeenCalledWith('FIX');
  });

  it('routes failed review to FIX', async () => {
    const h = harness(state('REVIEW', { reviewPassed: false, reviewFailed: true }));
    await h.runtime.step('run-1');
    expect(h.kernel.transition).toHaveBeenCalledWith('FIX');
  });

  it('stops at explicit human confirmation gates', async () => {
    const h = harness(state('INIT'));
    const result = await h.runtime.runUntilHalt('run-1');
    expect(result.status).toBe('WAITING_FOR_GOAL_CONFIRMATION');
  });

  it('persists FIX attempts across Runtime instances', async () => {
    const h = harness(state('FIX'), {}, 2);
    await h.runtime.step('run-1');
    expect(h.getState().facts.fixAttempts).toBe(1);

    h.setState({ ...h.getState(), status: 'FIX' });
    const restarted = new ExecutionRuntime(h.runs, h.kernel, () => ({ read: () => h.getState(), write: (next) => h.setState(next) }), h.executor, { maxFixAttempts: 2 });
    await restarted.step('run-1');
    expect(h.getState().facts.fixAttempts).toBe(2);

    h.setState({ ...h.getState(), status: 'FIX' });
    const exhausted = new ExecutionRuntime(h.runs, h.kernel, () => ({ read: () => h.getState(), write: (next) => h.setState(next) }), h.executor, { maxFixAttempts: 2 });
    await exhausted.step('run-1');
    expect(h.getState().facts.fixAttempts).toBe(3);
    expect(h.getState().facts.fixAttemptsWithinLimit).toBe(false);
    expect(h.getState().status).toBe('BLOCKED');
    expect(h.executor.execute).toHaveBeenCalledTimes(2);
  });

  it('resetFixAttempts persists the reset', () => {
    const h = harness(state('FIX', { fixAttempts: 2, fixAttemptsWithinLimit: false }));
    h.runtime.resetFixAttempts('run-1');
    expect(h.getState().facts.fixAttempts).toBe(0);
    expect(h.getState().facts.fixAttemptsWithinLimit).toBe(true);
  });

  it('rejects an invalid retry limit at construction time', () => {
    const h = harness(state('FIX'));
    expect(() => new ExecutionRuntime(h.runtime, h.kernel, () => ({ read: () => h.getState(), write: () => undefined }), h.executor, { maxFixAttempts: 0 })).toThrow('[LOOP_BLOCKED]');
  });
});
