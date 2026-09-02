import { describe, expect, it, vi } from 'vitest';
import { GuardedStageExecutor, executeAgentTool } from './stage-executor';
import type { LoopRuntimeKernel, LoopRuntimeState } from './kernel';

const state = { runId: 'run-1', status: 'IMPLEMENT', policyRevision: 1, snapshot: {} as never, facts: {} as never } as LoopRuntimeState;

describe('GuardedStageExecutor', () => {
  it('dispatches only to explicitly registered stage handlers', async () => {
    const handler = { execute: vi.fn(async () => ({ facts: { implementationCompleted: true } })) };
    const kernel = {} as LoopRuntimeKernel;
    const executor = new GuardedStageExecutor(kernel, { IMPLEMENT: handler });

    await expect(executor.execute('IMPLEMENT', state)).resolves.toEqual({ facts: { implementationCompleted: true } });
    expect(handler.execute).toHaveBeenCalledWith(state);
  });

  it('blocks an unregistered stage instead of silently falling back', async () => {
    const executor = new GuardedStageExecutor({} as LoopRuntimeKernel, {});
    await expect(executor.execute('PLAN', state)).rejects.toThrow('[LOOP_BLOCKED]');
  });

  it('routes Agent Tool calls through Kernel capability enforcement', async () => {
    const capability = vi.fn(async () => 'ok');
    const kernel = { executeCapability: vi.fn((_input, executor) => executor.execute()) } as unknown as LoopRuntimeKernel;
    const executor = new GuardedStageExecutor(kernel, {});

    await expect(executeAgentTool(executor, { capability: 'code.modify', execute: capability })).resolves.toBe('ok');
    expect(kernel.executeCapability).toHaveBeenCalledWith(expect.objectContaining({ capability: 'code.modify' }), expect.anything());
    expect(capability).toHaveBeenCalledTimes(1);
  });
});
