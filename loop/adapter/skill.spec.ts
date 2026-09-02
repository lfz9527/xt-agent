import { describe, expect, it, vi } from 'vitest';
import type { LoopRuntimeState } from '../runtime/kernel';
import { LoopSkillRuntimeAdapter } from './skill';

const state = (runId = 'run-1'): LoopRuntimeState => ({
  runId,
  status: 'PAUSED',
  policyRevision: 1,
  snapshot: { runId, policyRevision: 1, permissions: {}, capabilities: {} } as LoopRuntimeState['snapshot'],
  facts: {} as LoopRuntimeState['facts'],
  gitBaseline: {} as LoopRuntimeState['gitBaseline'],
  expectedWorktreeFingerprint: 'fp',
});

describe('LoopSkillRuntimeAdapter', () => {
  it('delegates /loop run to the shared RunService boundary', async () => {
    const run = vi.fn(async () => state('run-1'));
    const resume = vi.fn(async () => state('run-1'));
    const adapter = new LoopSkillRuntimeAdapter({ run, resume });

    await expect(adapter.invoke({ action: 'run' })).resolves.toEqual(state('run-1'));
    expect(run).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
  });

  it('delegates /loop resume with the supplied Run ID', async () => {
    const run = vi.fn(async () => state());
    const resume = vi.fn(async (runId: string) => state(runId));
    const adapter = new LoopSkillRuntimeAdapter({ run, resume });

    await expect(adapter.invoke({ action: 'resume', runId: 'run-42' })).resolves.toEqual(state('run-42'));
    expect(resume).toHaveBeenCalledWith('run-42');
    expect(run).not.toHaveBeenCalled();
  });

  it('blocks an empty resume Run ID before entering Runtime', async () => {
    const runtime = { run: vi.fn(), resume: vi.fn() };
    const adapter = new LoopSkillRuntimeAdapter(runtime);

    expect(() => adapter.invoke({ action: 'resume', runId: '  ' })).toThrow('[LOOP_BLOCKED] runId is required');
    expect(runtime.resume).not.toHaveBeenCalled();
  });

  it('does not implement a second lifecycle or mutate Runtime state itself', async () => {
    const runtime = { run: vi.fn(async () => state()), resume: vi.fn(async () => state()) };
    const adapter = new LoopSkillRuntimeAdapter(runtime);

    await adapter.run();
    await adapter.resume('run-1');

    expect(runtime.run).toHaveBeenCalledOnce();
    expect(runtime.resume).toHaveBeenCalledWith('run-1');
    expect(adapter).not.toHaveProperty('state');
  });
});
