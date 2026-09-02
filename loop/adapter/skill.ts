import type { LoopRuntimeState } from '../runtime/kernel';
import type { RunService } from '../cli/run-service';

export type LoopSkillRequest =
  | { action: 'run' }
  | { action: 'resume'; runId: string };

export interface LoopSkillRuntimePort {
  run(): Promise<LoopRuntimeState>;
  resume(runId: string): Promise<LoopRuntimeState>;
}

/**
 * P2-9 Adapter：将 Agent `/loop` Skill 请求映射到唯一的 Runtime Adapter。
 * Skill 只表达入口意图；生命周期、状态机、Policy、Permission、Trust、Approval
 * 和 Evidence 逻辑全部留在 Runtime / RunService。
 */
export class LoopSkillRuntimeAdapter implements LoopSkillRuntimePort {
  private readonly runtime: LoopSkillRuntimePort;

  constructor(runtime: LoopSkillRuntimePort | RunService) {
    this.runtime = runtime;
  }

  run(): Promise<LoopRuntimeState> {
    return this.runtime.run();
  }

  resume(runId: string): Promise<LoopRuntimeState> {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');
    return this.runtime.resume(runId);
  }

  invoke(request: LoopSkillRequest): Promise<LoopRuntimeState> {
    if (request.action === 'run') return this.run();
    if (request.action === 'resume') return this.resume(request.runId);
    throw new Error('[LOOP_BLOCKED] unsupported /loop action');
  }
}
