import { describe, expect, it, vi } from 'vitest';
import { FileCheckpointStore, checkpointInputFingerprint } from './checkpoint';
import { ExecutionRuntime } from './execution-runtime';
import type { LoopRuntimeState, LoopRuntimeKernel, StateStore } from './kernel';
import type { RunRuntime } from './run-runtime';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeState(status = 'PLAN'): LoopRuntimeState {
  return {
    runId: 'run-1', status, policyRevision: 1,
    snapshot: { runId: 'run-1', policyRevision: 1, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: new Date().toISOString() },
    facts: {
      executionApprovalSatisfied: true, planArtifactExists: true, implementationCompleted: false,
      verificationPassed: false, verificationFailed: false, reviewPassed: false, reviewFailed: false,
      acceptancePassed: false, finalApprovalSatisfied: false, finalApprovalRejected: false,
      fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: true, pauseExpired: false,
    },
  };
}

describe('FileCheckpointStore', () => {
  it('persists checkpoints atomically and validates them after a new store is created', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'loop-checkpoint-'));
    const first = new FileCheckpointStore(workspace);
    const checkpoint = {
      schemaVersion: 1, runId: 'run-1', stage: 'IMPLEMENT' as const, checkpointId: 'cp-1',
      inputFingerprint: checkpointInputFingerprint('run-1', 'IMPLEMENT', 1, { implementationCompleted: true }),
      facts: { implementationCompleted: true }, nextStatus: 'VERIFY', completedAt: new Date().toISOString(),
    };
    first.write(checkpoint);
    const second = new FileCheckpointStore(workspace);
    expect(second.read('run-1')).toEqual(checkpoint);
    expect(JSON.parse(readFileSync(join(workspace, 'runtime/runs/run-1/checkpoint.json'), 'utf8')).checkpointId).toBe('cp-1');
  });

  it('recovers a completed stage without invoking the Agent/Tool again', async () => {
    const state = makeState();
    const store: StateStore = { read: () => state, write: (next) => Object.assign(state, next) };
    const runs = { loadRun: vi.fn(() => state) } as unknown as RunRuntime;
    const kernel = { transition: vi.fn((to: string) => { state.status = to; }) } as unknown as LoopRuntimeKernel;
    const executor = { execute: vi.fn(async () => ({ facts: { implementationCompleted: true } })) };
    const workspace = mkdtempSync(join(tmpdir(), 'loop-recovery-'));
    const checkpoints = new FileCheckpointStore(workspace);
    checkpoints.write({
      schemaVersion: 1, runId: 'run-1', stage: 'PLAN', checkpointId: 'cp-1',
      inputFingerprint: checkpointInputFingerprint('run-1', 'PLAN', 1, state.facts as unknown as Record<string, unknown>),
      facts: { implementationCompleted: true }, nextStatus: 'IMPLEMENT', completedAt: new Date().toISOString(),
    });

    const runtime = new ExecutionRuntime(runs, kernel, () => store, executor, { checkpointStore: checkpoints });
    const recovered = await runtime.step('run-1');

    expect(executor.execute).not.toHaveBeenCalled();
    expect(kernel.transition).toHaveBeenCalledWith('IMPLEMENT');
    expect(recovered.status).toBe('IMPLEMENT');
    expect(checkpoints.read('run-1')).toBeUndefined();
  });

  it('blocks recovery when checkpoint input does not match the persisted runtime state', async () => {
    const state = makeState();
    const store: StateStore = { read: () => state, write: (next) => Object.assign(state, next) };
    const runs = { loadRun: vi.fn(() => state) } as unknown as RunRuntime;
    const kernel = { transition: vi.fn() } as unknown as LoopRuntimeKernel;
    const executor = { execute: vi.fn(async () => ({})) };
    const workspace = mkdtempSync(join(tmpdir(), 'loop-recovery-mismatch-'));
    const checkpoints = new FileCheckpointStore(workspace);
    checkpoints.write({
      schemaVersion: 1, runId: 'run-1', stage: 'PLAN', checkpointId: 'cp-1',
      inputFingerprint: checkpointInputFingerprint('run-1', 'PLAN', 1, { planArtifactExists: false }),
      facts: { implementationCompleted: true }, nextStatus: 'IMPLEMENT', completedAt: new Date().toISOString(),
    });

    const runtime = new ExecutionRuntime(runs, kernel, () => store, executor, { checkpointStore: checkpoints });
    await expect(runtime.step('run-1')).rejects.toThrow('[LOOP_BLOCKED]');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
