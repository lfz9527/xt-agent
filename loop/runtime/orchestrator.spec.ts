import { describe, expect, it, vi } from 'vitest';
import type { LoopRuntimeState } from './kernel';
import { LoopOrchestrator } from './orchestrator';
import { StageRegistry } from './stage-registry';

function state(status: string): LoopRuntimeState {
  return {
    runId: 'run-1', status, policyRevision: 1,
    snapshot: { runId: 'run-1', policyRevision: 1, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: new Date().toISOString() },
    facts: {
      executionApprovalSatisfied: true, planArtifactExists: true, implementationCompleted: true,
      verificationPassed: true, verificationFailed: false, reviewPassed: true, reviewFailed: false,
      acceptancePassed: true, finalApprovalSatisfied: true, finalApprovalRejected: false,
      fixAttempts: 0, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: true, pauseExpired: false,
    },
  };
}

describe('LoopOrchestrator', () => {
  it('delegates one runtime step without implementing stage execution itself', async () => {
    const runtime = { step: vi.fn(async () => state('VERIFY')), runUntilHalt: vi.fn() } as any;
    const orchestrator = new LoopOrchestrator(runtime, new StageRegistry());
    await expect(orchestrator.step('run-1')).resolves.toMatchObject({ status: 'VERIFY' });
    expect(runtime.step).toHaveBeenCalledWith('run-1');
  });

  it('delegates run lifecycle to ExecutionRuntime', async () => {
    const result = state('DONE');
    const runtime = { step: vi.fn(), runUntilHalt: vi.fn(async () => result) } as any;
    const orchestrator = new LoopOrchestrator(runtime);
    await expect(orchestrator.runUntilHalt('run-1')).resolves.toEqual(result);
    expect(runtime.runUntilHalt).toHaveBeenCalledWith('run-1');
  });
});
