import { describe, expect, it, vi } from 'vitest';
import { RunService } from './run-service';

const state = (status: string, runId = 'run-1') => ({
  runId,
  status,
  policyRevision: 1,
  snapshot: { runId, policyRevision: 1, trust: 'medium', permissions: {}, effectivePolicy: {}, resolvedAt: '2026-09-02T00:00:00.000Z' },
  facts: {
    executionApprovalSatisfied: true,
    planArtifactExists: true,
    implementationCompleted: true,
    verificationPassed: true,
    verificationFailed: false,
    reviewPassed: true,
    reviewFailed: false,
    acceptancePassed: true,
    finalApprovalSatisfied: true,
    finalApprovalRejected: false,
    fixAttempts: 0,
    fixAttemptsWithinLimit: true,
    resumeRequested: false,
    resumeStateValid: true,
    pausedFromStatus: 'VERIFY',
    pauseExpired: false,
  },
});

describe('RunService', () => {
  it('creates a run and delegates execution to ExecutionRuntime', async () => {
    const created = state('INIT');
    const completed = state('WAITING_FOR_GOAL_CONFIRMATION');
    const runtime = { createRun: vi.fn(() => created) };
    const execution = { runUntilHalt: vi.fn(async () => completed) };
    const kernel = { transition: vi.fn() };

    const result = await new RunService({ runtime: runtime as never, execution, kernel }).run();

    expect(runtime.createRun).toHaveBeenCalledOnce();
    expect(execution.runUntilHalt).toHaveBeenCalledWith('run-1');
    expect(result).toBe(completed);
  });

  it('resumes through the persisted target status before execution', async () => {
    const paused = state('PAUSED');
    const resumed = { ...paused, facts: { ...paused.facts, resumeRequested: true } };
    const completed = state('VERIFY');
    const runtime = { resume: vi.fn(() => resumed) };
    const execution = { runUntilHalt: vi.fn(async () => completed) };
    const kernel = { transition: vi.fn() };

    const result = await new RunService({ runtime: runtime as never, execution, kernel }).resume('run-1');

    expect(runtime.resume).toHaveBeenCalledWith('run-1');
    expect(kernel.transition).toHaveBeenCalledWith('VERIFY');
    expect(execution.runUntilHalt).toHaveBeenCalledWith('run-1');
    expect(result).toBe(completed);
  });
});
