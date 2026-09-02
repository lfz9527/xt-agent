import { describe, expect, it, vi } from 'vitest';
import { LoopRuntimeKernel, type LoopRuntimeState } from './kernel';
import { RuntimeResourceLock } from './lock';
import type { RuntimeFacts } from './enforcement';

const snapshot = { runId: 'run-1', policyRevision: 3, trust: 'high', permissions: {}, effectivePolicy: {}, resolvedAt: new Date(0).toISOString() };
const facts: RuntimeFacts = {
  executionApprovalSatisfied: false, planArtifactExists: false, implementationCompleted: false,
  verificationPassed: false, verificationFailed: false, reviewPassed: false, reviewFailed: false,
  acceptancePassed: false, finalApprovalSatisfied: false, finalApprovalRejected: false,
  fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: false, pauseExpired: false,
};

function fixture() {
  const state: LoopRuntimeState = { runId: 'run-1', status: 'IMPLEMENT', policyRevision: 3, snapshot, facts };
  const store = { read: vi.fn(() => state), write: vi.fn((next: LoopRuntimeState) => Object.assign(state, next)) };
  const policy = { currentRevision: vi.fn(() => 3) };
  const lock = new RuntimeResourceLock('/tmp/loop-kernel-test');
  return { state, store, policy, kernel: new LoopRuntimeKernel(store, policy, undefined, undefined, lock) };
}

describe('LoopRuntimeKernel', () => {
  it('executes only after the enforcement boundary', async () => {
    const { kernel } = fixture();
    const execute = vi.fn(async () => 'ok');
    await expect(kernel.executeCapability({ capability: 'filesystem.read', capabilityDecision: 'allow', dangerous: false }, { execute })).resolves.toBe('ok');
    expect(execute).toHaveBeenCalledOnce();
  });
  it('requires an approval provider before executing confirm capabilities', async () => {
    const { kernel } = fixture();
    const execute = vi.fn(async () => 'must-not-run');
    await expect(kernel.executeCapability({ capability: 'git.push', capabilityDecision: 'confirm' }, { execute })).rejects.toThrow('approval provider');
    expect(execute).not.toHaveBeenCalled();
  });
  it('rechecks policy revision after approval', async () => {
    const { store, policy } = fixture();
    const approval = { request: vi.fn(async () => 'approved' as const) };
    const kernel = new LoopRuntimeKernel(store, policy, approval);
    policy.currentRevision.mockReturnValueOnce(3).mockReturnValueOnce(4);
    const execute = vi.fn(async () => 'must-not-run');
    await expect(kernel.executeCapability({ capability: 'git.push', capabilityDecision: 'confirm' }, { execute })).rejects.toThrow('LOOP_BLOCKED');
    expect(execute).not.toHaveBeenCalled();
  });
  it('prevents guarded state transitions from bypassing the kernel', () => {
    const { kernel, store } = fixture();
    expect(() => kernel.transition('VERIFY')).toThrow('LOOP_BLOCKED');
    expect(store.write).not.toHaveBeenCalled();
  });
  it('writes state only after runtime facts satisfy the guard', () => {
    const { kernel, store, state } = fixture();
    state.facts.implementationCompleted = true;
    kernel.transition('VERIFY');
    expect(store.write).toHaveBeenCalledOnce();
    expect(store.read().status).toBe('VERIFY');
  });
  it('blocks state transitions when the policy revision becomes stale', () => {
    const { kernel, policy, store } = fixture();
    policy.currentRevision.mockReturnValue(4);
    expect(() => kernel.transition('VERIFY')).toThrow('LOOP_BLOCKED');
    expect(store.write).not.toHaveBeenCalled();
  });

  it('never executes a capability after an explicit deny', async () => {
    const { kernel } = fixture();
    const execute = vi.fn(async () => 'must-not-run');
    await expect(kernel.executeCapability({ capability: 'filesystem.write', capabilityDecision: 'deny', approvalDecision: 'approved' }, { execute })).rejects.toThrow('[LOOP_DENY]');
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute when approval is rejected and records both approval events', async () => {
    const { kernel } = fixture();
    const approval = { request: vi.fn(async () => 'rejected' as const) };
    const audit = { append: vi.fn() };
    const rejectedKernel = new LoopRuntimeKernel(fixture().store, fixture().policy, approval, audit);
    const execute = vi.fn(async () => 'must-not-run');
    await expect(rejectedKernel.executeCapability({ capability: 'git.push', capabilityDecision: 'confirm' }, { execute })).rejects.toThrow('[LOOP_DENY]');
    expect(execute).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledTimes(3);
  });

  it('releases the state lock when a guarded transition fails', () => {
    const { kernel, state } = fixture();
    expect(() => kernel.transition('VERIFY')).toThrow('LOOP_BLOCKED');
    state.facts.implementationCompleted = true;
    expect(() => kernel.transition('VERIFY')).not.toThrow();
  });

  it('does not mutate a resource without a git baseline and expected fingerprint', async () => {
    const { kernel } = fixture();
    const execute = vi.fn(async () => 'must-not-run');
    await expect(kernel.mutateResource({ type: 'mutable', pattern: 'src/**/*.ts', capability: 'code.modify' }, 'code.modify', 'src/app.ts', { execute })).rejects.toThrow('[LOOP_BLOCKED]');
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires a mutation journal before entering the resource mutation path', async () => {
    const { state, policy } = fixture();
    state.gitBaseline = { commit: 'HEAD', branch: 'loop/permission-system', worktreeFingerprint: '' };
    state.expectedWorktreeFingerprint = '';
    const kernel = new LoopRuntimeKernel(fixture().store, policy, undefined, undefined, new RuntimeResourceLock('/tmp/loop-kernel-test'));
    const execute = vi.fn(async () => 'must-not-run');
    await expect(kernel.mutateResource({ type: 'mutable', pattern: 'src/**/*.ts', capability: 'code.modify' }, 'code.modify', 'src/app.ts', { execute })).rejects.toThrow('mutation journal is required');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a resource mutation before acquiring the lock when policy denies it', async () => {
    const { kernel, state } = fixture();
    state.gitBaseline = { commit: 'HEAD', branch: 'loop/permission-system', worktreeFingerprint: '' };
    state.expectedWorktreeFingerprint = '';
    const journal = { append: vi.fn() };
    const lock = new RuntimeResourceLock('/tmp/loop-kernel-test');
    const lockedKernel = new LoopRuntimeKernel(fixture().store, fixture().policy, undefined, undefined, lock, journal);
    const execute = vi.fn(async () => 'must-not-run');
    await expect(lockedKernel.mutateResource({ type: 'readonly', pattern: '.git/**' }, 'code.modify', '.git/config', { execute })).rejects.toThrow('[LOOP_DENY]');
    expect(execute).not.toHaveBeenCalled();
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('does not write runtime state when resource mutation execution fails', async () => {
    const { store, state, policy } = fixture();
    state.gitBaseline = { commit: 'HEAD', branch: 'loop/permission-system', worktreeFingerprint: '' };
    state.expectedWorktreeFingerprint = '';
    const journal = { append: vi.fn() };
    const lock = new RuntimeResourceLock('/tmp/loop-kernel-test');
    const kernel = new LoopRuntimeKernel(store, policy, undefined, undefined, lock, journal);
    const execute = vi.fn(async () => { throw new Error('mutation failed'); });
    await expect(kernel.mutateResource({ type: 'mutable', pattern: 'src/**/*.ts', capability: 'code.modify' }, 'code.modify', 'src/app.ts', { execute })).rejects.toThrow('mutation failed');
    expect(store.write).not.toHaveBeenCalled();
    expect(journal.append).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', resource: 'src/app.ts', capability: 'code.modify' }));
  });
});
