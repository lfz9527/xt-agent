import type { ExecutionRuntime } from '../runtime/execution-runtime';
import type { LoopRuntimeKernel, LoopRuntimeState } from '../runtime/kernel';
import type { RunRuntime } from '../runtime/run-runtime';

export interface RunServiceOptions {
  runtime: RunRuntime;
  execution: Pick<ExecutionRuntime, 'runUntilHalt'>;
  kernel: Pick<LoopRuntimeKernel, 'transition'>;
}

/**
 * P2-7 Adapter Service：只协调 RunRuntime、Kernel 与 ExecutionRuntime。
 * 不实现状态机、Policy、Permission、Trust、Approval 或 Evidence 逻辑。
 */
export class RunService {
  constructor(private readonly options: RunServiceOptions) {}

  async run(): Promise<LoopRuntimeState> {
    const state = this.options.runtime.createRun();
    return this.options.execution.runUntilHalt(state.runId);
  }

  async resume(runId: string): Promise<LoopRuntimeState> {
    const state = this.options.runtime.resume(runId);
    const target = state.facts.pausedFromStatus;
    if (!target) throw new Error('[LOOP_BLOCKED] paused run has no persisted resume target');
    this.options.kernel.transition(target);
    return this.options.execution.runUntilHalt(runId);
  }
}
