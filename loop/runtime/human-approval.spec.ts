import { describe, expect, it, vi } from 'vitest';
import { HumanApprovalGate } from './human-approval';
import type { LoopRuntimeState, StateStore } from './kernel';
import type { PolicySnapshot } from './enforcement';

const snapshot = (runId: string, revision = 1): PolicySnapshot => ({ runId, policyRevision: revision, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: new Date().toISOString() });

const fixture = (status: string): { store: StateStore; get: () => LoopRuntimeState } => {
  let current: LoopRuntimeState = {
    runId: 'run-1', status, policyRevision: 1, snapshot: snapshot('run-1'),
    facts: {
      executionApprovalSatisfied: false, planArtifactExists: false, implementationCompleted: false,
      verificationPassed: false, verificationFailed: false, reviewPassed: false, reviewFailed: false,
      acceptancePassed: false, finalApprovalSatisfied: false, finalApprovalRejected: false,
      fixAttempts: 0, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: false, pauseExpired: false,
    },
  };
  const store: StateStore = { read: () => current, write: (next) => { current = next; } };
  return { store, get: () => current };
};

describe('HumanApprovalGate', () => {
  it('persists execution approval through the unified gate', async () => {
    const h = fixture('WAITING_FOR_GOAL_CONFIRMATION');
    const gate = new HumanApprovalGate(() => h.store, { currentRevision: () => 1 });
    const provider = { request: vi.fn(async () => 'approved' as const) };
    await expect(gate.request('run-1', 'execution', '确认执行计划', provider)).resolves.toBe('approved');
    expect(h.get().facts.executionApprovalSatisfied).toBe(true);
    expect(provider.request).toHaveBeenCalledWith({ runId: 'run-1', gate: 'execution', reason: '确认执行计划', policyRevision: 1 });
  });

  it('persists final rejection so the guard can route to FIX', async () => {
    const h = fixture('READY_FOR_CONFIRMATION');
    const gate = new HumanApprovalGate(() => h.store, { currentRevision: () => 1 });
    const provider = { request: vi.fn(async () => 'rejected' as const) };
    await gate.request('run-1', 'final', '最终验收', provider);
    expect(h.get().facts.finalApprovalSatisfied).toBe(false);
    expect(h.get().facts.finalApprovalRejected).toBe(true);
  });

  it('does not accept a gate while the corresponding approval state is inactive', () => {
    const h = fixture('PLAN');
    const gate = new HumanApprovalGate(() => h.store, { currentRevision: () => 1 });
    expect(() => gate.resolve('run-1', 'execution', 'approved')).toThrow('[LOOP_BLOCKED] human approval gate execution is not active in PLAN');
  });

  it('blocks approval when policy revision changes while waiting', async () => {
    const h = fixture('WAITING_FOR_GOAL_CONFIRMATION');
    const policy = { currentRevision: vi.fn(() => 1) };
    const gate = new HumanApprovalGate(() => h.store, policy);
    const provider = { request: vi.fn(async () => { policy.currentRevision.mockReturnValue(2); return 'approved' as const; }) };
    await expect(gate.request('run-1', 'execution', '确认', provider)).rejects.toThrow('[LOOP_BLOCKED] policy revision changed while waiting for human approval');
    expect(h.get().facts.executionApprovalSatisfied).toBe(false);
  });
});
