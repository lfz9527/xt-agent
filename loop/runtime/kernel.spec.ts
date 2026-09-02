import { describe, expect, it, vi } from 'vitest';
import { LoopRuntimeKernel, type LoopRuntimeState } from './kernel';

const snapshot = {
  runId: 'run-1',
  policyRevision: 3,
  trust: 'high',
  permissions: {},
  effectivePolicy: {},
  resolvedAt: new Date(0).toISOString(),
};

function fixture() {
  const state: LoopRuntimeState = { runId: 'run-1', status: 'IMPLEMENT', policyRevision: 3, snapshot };
  const store = { read: vi.fn(() => state), write: vi.fn((next: LoopRuntimeState) => Object.assign(state, next)) };
  const policy = { currentRevision: vi.fn(() => 3) };
  return { state, store, policy, kernel: new LoopRuntimeKernel(store, policy) };
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
    expect(() => kernel.transition('VERIFY', { implementationCompleted: false })).toThrow('LOOP_BLOCKED');
    expect(store.write).not.toHaveBeenCalled();
  });

  it('writes state only after a valid guarded transition', () => {
    const { kernel, store } = fixture();
    kernel.transition('VERIFY', { implementationCompleted: true });
    expect(store.write).toHaveBeenCalledOnce();
    expect(store.read().status).toBe('VERIFY');
  });

  it('blocks state transitions when the policy revision becomes stale', () => {
    const { kernel, policy, store } = fixture();
    policy.currentRevision.mockReturnValue(4);
    expect(() => kernel.transition('VERIFY', { implementationCompleted: true })).toThrow('LOOP_BLOCKED');
    expect(store.write).not.toHaveBeenCalled();
  });
});
