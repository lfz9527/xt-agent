import type { LoopRuntimeState } from './kernel';
import { ExecutionRuntime } from './execution-runtime';
import { StageRegistry } from './stage-registry';

/** P2-3.1：Orchestrator 只负责 Run 生命周期调度；具体阶段执行仍由 ExecutionRuntime/StageExecutor 完成。 */
export class LoopOrchestrator {
  constructor(
    private readonly runtime: ExecutionRuntime,
    private readonly stageRegistry: StageRegistry = new StageRegistry(),
  ) {}

  async step(runId: string): Promise<LoopRuntimeState> {
    const state = await this.runtime.step(runId);
    if (this.stageRegistry.has(state.status)) return state;
    return state;
  }

  runUntilHalt(runId: string): Promise<LoopRuntimeState> {
    return this.runtime.runUntilHalt(runId);
  }
}
