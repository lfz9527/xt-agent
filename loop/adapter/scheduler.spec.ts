import { describe, expect, it, vi } from 'vitest';
import type { LoopRuntimeState } from '../runtime/kernel';
import { SchedulerRuntimeAdapter, type SchedulerTimerPort } from './scheduler';

const state = (): LoopRuntimeState => ({
  runId: 'run-1', status: 'PAUSED', policyRevision: 1,
  snapshot: { runId: 'run-1', policyRevision: 1, permissions: {}, capabilities: {} } as LoopRuntimeState['snapshot'],
  facts: {} as LoopRuntimeState['facts'], gitBaseline: {} as LoopRuntimeState['gitBaseline'], expectedWorktreeFingerprint: 'fp',
});

const timer = (): SchedulerTimerPort & { fireTimeout: () => void; fireInterval: () => void } => {
  let timeout: (() => void) | undefined;
  let interval: (() => void) | undefined;
  return {
    setTimeout: vi.fn((callback) => { timeout = callback; return 1 as ReturnType<typeof setTimeout>; }),
    clearTimeout: vi.fn(),
    setInterval: vi.fn((callback) => { interval = callback; return 2 as ReturnType<typeof setInterval>; }),
    clearInterval: vi.fn(),
    fireTimeout: () => timeout?.(),
    fireInterval: () => interval?.(),
  };
};

describe('SchedulerRuntimeAdapter', () => {
  it('delegates each timer trigger to the shared RunService boundary', async () => {
    const run = vi.fn(async () => state());
    const clock = timer();
    const adapter = new SchedulerRuntimeAdapter({ run }, clock);
    adapter.schedule({ id: 'daily', delayMs: 10 });
    clock.fireTimeout();
    await Promise.resolve();
    expect(run).toHaveBeenCalledOnce();
  });

  it('supports recurring schedules without owning Runtime state', async () => {
    const run = vi.fn(async () => state());
    const clock = timer();
    const adapter = new SchedulerRuntimeAdapter({ run }, clock);
    adapter.schedule({ id: 'heartbeat', intervalMs: 1000 });
    clock.fireInterval();
    clock.fireInterval();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    expect(adapter).not.toHaveProperty('state');
  });

  it('blocks duplicate job IDs', () => {
    const clock = timer();
    const adapter = new SchedulerRuntimeAdapter({ run: vi.fn() }, clock);
    adapter.schedule({ id: 'job', delayMs: 1 });
    expect(() => adapter.schedule({ id: 'job', delayMs: 1 })).toThrow('[LOOP_BLOCKED] scheduler job already exists: job');
  });

  it('cancels a scheduled job and prevents later ownership of the timer', () => {
    const clock = timer();
    const adapter = new SchedulerRuntimeAdapter({ run: vi.fn() }, clock);
    const handle = adapter.schedule({ id: 'job', delayMs: 1 });
    expect(handle.cancel()).toBeUndefined();
    expect(adapter.has('job')).toBe(false);
    expect(clock.clearTimeout).toHaveBeenCalledOnce();
  });

  it('validates scheduling input at the Adapter boundary', () => {
    const adapter = new SchedulerRuntimeAdapter({ run: vi.fn() }, timer());
    expect(() => adapter.schedule({ id: ' ', delayMs: 1 })).toThrow('[LOOP_BLOCKED] scheduler job id is required');
    expect(() => adapter.schedule({ id: 'a' })).toThrow('[LOOP_BLOCKED] scheduler job requires exactly one of delayMs or intervalMs');
    expect(() => adapter.schedule({ id: 'a', delayMs: -1 })).toThrow('[LOOP_BLOCKED] scheduler delay must be a non-negative finite number');
    expect(() => adapter.schedule({ id: 'a', intervalMs: 0 })).toThrow('[LOOP_BLOCKED] scheduler interval must be greater than zero');
  });
});
