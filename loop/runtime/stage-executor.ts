import type { LoopRuntimeState } from './kernel';
import type { ExecutionStage, StageExecutor, StageResult } from './execution-runtime';
import type { LoopRuntimeKernel, CapabilityExecutor, ResourceMutationExecutor } from './kernel';

export interface StageCapability {
  capability: string;
  dangerous?: boolean;
}

export interface StageHandler {
  execute(state: LoopRuntimeState): Promise<StageResult>;
}

export interface StageActionMap {
  [stage: string]: StageHandler;
}

/**
 * P2-3.2 的受保护 Stage Executor。
 * Agent/Tool 只能通过这里进入 Runtime；真正的 capability 与 resource mutation
 * 仍然必须经过 Kernel 的 Policy、Approval、Lock、Git Consistency 等检查。
 */
export class GuardedStageExecutor implements StageExecutor {
  constructor(
    private readonly kernel: LoopRuntimeKernel,
    private readonly handlers: Partial<Record<ExecutionStage, StageHandler>>,
  ) {}

  async execute(stage: ExecutionStage, state: LoopRuntimeState): Promise<StageResult> {
    const handler = this.handlers[stage];
    if (!handler) throw new Error(`[LOOP_BLOCKED] no stage handler registered for ${stage}`);
    return handler.execute(state);
  }

  /** Agent/Tool 调用 capability 的唯一推荐入口。 */
  capability<T>(
    input: Parameters<LoopRuntimeKernel['executeCapability']>[0],
    executor: CapabilityExecutor<T>,
  ): Promise<T> {
    return this.kernel.executeCapability(input, executor);
  }

  /** Agent/Tool 修改项目资源的唯一推荐入口。 */
  mutate<T>(
    resourcePolicy: Parameters<LoopRuntimeKernel['mutateResource']>[0],
    capability: string,
    path: string,
    executor: ResourceMutationExecutor<T>,
  ): Promise<T> {
    return this.kernel.mutateResource(resourcePolicy, capability, path, executor);
  }
}

export interface AgentToolCall<T> {
  capability: string;
  dangerous?: boolean;
  execute: () => Promise<T>;
}

/** 将一个 Agent Tool 调用显式绑定到 Runtime Capability。 */
export function executeAgentTool<T>(
  executor: GuardedStageExecutor,
  call: AgentToolCall<T>,
): Promise<T> {
  return executor.capability(
    { capability: call.capability, dangerous: call.dangerous },
    { execute: call.execute },
  );
}
