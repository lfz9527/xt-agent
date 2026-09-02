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
      fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: true, pauseExpired: false,
      ...facts,
    },
  };
}

function harness(initial: LoopRuntimeState, results: Record<string, Partial<LoopRuntimeState['facts']>> = {}) {
  let current = initial;
  const store: StateStore = { read: () => current, write: (next) => { current = next; } };
  const runs = { loadRun: vi.fn(() => current) } as unknown as RunRuntime;
  const kernel = { transition: vi.fn((to: string) => { current = { ...current, status: to }; }) } as unknown as LoopRuntimeKernel;
  const executor: StageExecutor = { execute: vi.fn(async (stage) => ({ facts: results[stage] ?? {} })) };
  const runtime = new ExecutionRuntime(runs, kernel, () => store, executor);
  return { runtime, executor, kernel, getState: () => current };
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

  it('blocks after exceeding the fix retry limit', async () => {
    const h = harness(state('FIX', { verificationPassed: false, verificationFailed: true }), {});
    const runtime = new ExecutionRuntime(h.runtime['runs'], h.runtime['kernel'], () => ({
      read: () => h.getState(),
      write: (next: LoopRuntimeState) => Object.assign(h.getState(), next),
    }), h.executor, { maxFixAttempts: 1 });
    await runtime.step('run-1');
    await runtime.step('run-1');
    expect(h.kernel.transition).toHaveBeenLastCalledWith('BLOCKED');
  });
});
