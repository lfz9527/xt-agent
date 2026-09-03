import { describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService } from './agent-service';

const state = (status: string, runId = 'run-1') => ({
  runId,
  status,
  policyRevision: 1,
  snapshot: { runId, policyRevision: 1, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: '2026-09-03T00:00:00.000Z' },
  facts: {
    executionApprovalSatisfied: status !== 'WAITING_FOR_GOAL_CONFIRMATION',
    planArtifactExists: true,
    implementationCompleted: true,
    verificationPassed: true,
    verificationFailed: false,
    reviewPassed: true,
    reviewFailed: false,
    acceptancePassed: true,
    finalApprovalSatisfied: status !== 'READY_FOR_CONFIRMATION',
    finalApprovalRejected: false,
    fixAttempts: 0,
    fixAttemptsWithinLimit: true,
    resumeRequested: false,
    resumeStateValid: true,
    pausedFromStatus: null,
    pauseExpired: false,
  },
});

describe('AgentRuntimeService', () => {
  it('starts a run only after the project workspace is ensured', () => {
    const created = state('INIT');
    const workspace = { ensure: vi.fn() };
    const runtime = { createRun: vi.fn(() => created) };
    const service = new AgentRuntimeService({
      runtime: runtime as never,
      execution: {} as never,
      approval: {} as never,
      kernel: {} as never,
      workspace,
    });

    expect(service.start()).toBe(created);
    expect(workspace.ensure).toHaveBeenCalledOnce();
    expect(runtime.createRun).toHaveBeenCalledOnce();
  });

  it('submits stage results without accepting a target status', () => {
    const result = { facts: { planArtifactExists: true } };
    const completed = state('IMPLEMENT');
    const execution = { completeStage: vi.fn(() => completed) };
    const service = new AgentRuntimeService({
      runtime: { loadRun: vi.fn(() => state('PLAN')) } as never,
      execution,
      approval: {} as never,
      kernel: {} as never,
    });

    expect(service.submit('run-1', result)).toBe(completed);
    expect(execution.completeStage).toHaveBeenCalledWith('run-1', result);
  });

  it('lets the Kernel decide the execution approval transition', () => {
    const runtime = { loadRun: vi.fn(() => state('PLAN')) };
    const approval = { resolve: vi.fn(() => state('WAITING_FOR_GOAL_CONFIRMATION')) };
    const kernel = { transition: vi.fn() };
    const service = new AgentRuntimeService({
      runtime: runtime as never,
      execution: {} as never,
      approval,
      kernel,
    });

    const result = service.approve('run-1', 'execution', 'approved');

    expect(approval.resolve).toHaveBeenCalledWith('run-1', 'execution', 'approved');
    expect(kernel.transition).toHaveBeenCalledWith('PLAN');
    expect(result).toBe(runtime.loadRun.mock.results[0].value);
  });

  it('routes rejected final approval to FIX through the Kernel', () => {
    const runtime = { loadRun: vi.fn(() => state('FIX')) };
    const approval = { resolve: vi.fn(() => state('READY_FOR_CONFIRMATION')) };
    const kernel = { transition: vi.fn() };
    const service = new AgentRuntimeService({
      runtime: runtime as never,
      execution: {} as never,
      approval,
      kernel,
    });

    service.approve('run-1', 'final', 'rejected');

    expect(kernel.transition).toHaveBeenCalledWith('FIX');
  });
});
