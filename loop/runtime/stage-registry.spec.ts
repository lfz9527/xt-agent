import { describe, expect, it } from 'vitest';
import { StageRegistry } from './stage-registry';

const allStatuses = ['INIT', 'GOAL_REVIEW', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'FIX'];

describe('StageRegistry', () => {
  it('registers every executable runtime status exactly once', () => {
    const registry = new StageRegistry();
    expect(allStatuses.every((status) => registry.has(status))).toBe(true);
    expect(registry.resolve('INIT')).toBe('GOAL_REVIEW');
    expect(registry.resolve('GOAL_REVIEW')).toBe('GOAL_REVIEW');
    expect(registry.resolve('FIX')).toBe('FIX');
    expect(registry.resolve('READY_FOR_CONFIRMATION')).toBeUndefined();
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

  it('supports explicit project stage registration', () => {
    const registry = new StageRegistry([
      { stage: 'PLAN', statuses: ['CUSTOM_PLAN'] },
      { stage: 'IMPLEMENT', statuses: ['CUSTOM_IMPLEMENT'] },
    ]);
    expect(registry.resolve('CUSTOM_PLAN')).toBe('PLAN');
    expect(registry.resolve('PLAN')).toBeUndefined();
  });
});
