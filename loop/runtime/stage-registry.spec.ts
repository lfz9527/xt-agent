import { describe, expect, it } from 'vitest';
import type { LoopRuntimeState } from './kernel';
import { StageRegistry } from './stage-registry';

const allStatuses = ['INIT', 'GOAL_REVIEW', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'FIX', 'READY_FOR_CONFIRMATION'];

const state = (status: string, facts: Partial<LoopRuntimeState['facts']> = {}) => ({
  runId: 'test-run',
  status,
  policyRevision: 1,
  facts: {
    fixAttempts: 0,
    fixAttemptsWithinLimit: true,
    ...facts,
  },
}) as LoopRuntimeState;

describe('StageRegistry', () => {
  it('registers every executable runtime status exactly once', () => {
    const registry = new StageRegistry();
    expect(allStatuses.every((status) => registry.has(status))).toBe(true);
    expect(registry.resolve('INIT')).toBe('GOAL_REVIEW';
    expect(registry.resolve('GOAL_REVIEW')).toBe('GOAL_REVIEW');
    expect(registry.resolve('FIX')).toBe('FIX');
    expect(registry.resolve('READY_FOR_CONFIRMATION')).toBe('READY_FOR_CONFIRMATION');
  });

  it('resolves default stage transitions from the registry', () => {
    const registry = new StageRegistry();
    expect(registry.resolveNextStatus(state('INIT'), 'GOAL_REVIEW')).toBe('GOAL_REVIEW');
    expect(registry.resolveNextStatus(state('GOAL_REVIEW'), 'GOAL_REVIEW')).toBe('WAITING_FOR_GOAL_CONFIRMATION');
    expect(registry.resolveNextStatus(state('PLAN'), 'PLAN')).toBe('IMPLEMENT');
    expect(registry.resolveNextStatus(state('IMPLEMENT'), 'IMPLEMENT')).toBe('VERIFY');
    expect(registry.resolveNextStatus(state('VERIFY', { verificationPassed: true }), 'VERIFY')).toBe('REVIEW');
    expect(registry.resolveNextStatus(state('VERIFY', { verificationFailed: true }), 'VERIFY')).toBe('FIX');
    expect(registry.resolveNextStatus(state('REVIEW', { reviewPassed: true }), 'REVIEW')).toBe('READY_FOR_CONFIRMATION');
    expect(registry.resolveNextStatus(state('REVIEW', { reviewFailed: true }), 'REVIEW')).toBe('FIX');
    expect(registry.resolveNextStatus(state('FIX'), 'FIX')).toBe('IMPLEMENT');
    expect(registry.resolveNextStatus(state('READY_FOR_CONFIRMATION'), 'READY_FOR_CONFIRMATION')).toBe('DONE');
  });

  it('rejects duplicate status registration', () => {
    expect(() => new StageRegistry([
      { stage: 'PLAN', statuses: ['PLAN'] },
      { stage: 'IMPLEMENT', statuses: ['PLAN'] },
    ])).toThrow('[LOOP_BLOCKED] duplicate stage status registration: PLAN');
  });

  it('rejects empty stage registration', () => {
    expect(() => new StageRegistry([{ stage: 'PLAN', statuses: [] }])).toThrow('[LOOP_BLOCKED] stage PLAN must declare at least one status');
  });

  it('supports explicit project stage registration and transitions', () => {
    const registry = new StageRegistry([
      { stage: 'PLAN', statuses: ['CUSTOM_PLAN'], nextStatus: () => 'CUSTOM_IMPLEMENT' },
      { stage: 'IMPLEMENT', statuses: ['CUSTOM_IMPLEMENT'], nextStatus: () => 'CUSTOM_VERIFY' },
    ]);
    expect(registry.resolve('CUSTOM_PLAN')).toBe('PLAN');
    expect(registry.resolve('PLAN')).toBeUndefined();
    expect(registry.resolveNextStatus(state('CUSTOM_PLAN'), 'PLAN')).toBe('CUSTOM_IMPLEMENT');
  });
});
