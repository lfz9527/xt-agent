import type { LoopRuntimeState } from './kernel';
import type { ExecutionStage } from './execution-runtime';

export type StageTransitionResolver = (
  state: LoopRuntimeState,
  stage: ExecutionStage,
) => string | undefined;

export interface StageDefinition {
  stage: ExecutionStage;
  /** 当前 Runtime Status 对应的阶段；同一 stage 可以映射多个入口状态。 */
  statuses: readonly string[];
  /** 阶段完成后的下一状态；由 Registry 统一描述，避免 Runtime 再硬编码状态迁移。 */
  nextStatus?: StageTransitionResolver;
}

export class StageRegistry {
  private readonly byStatus = new Map<string, StageDefinition>();

  constructor(definitions: readonly StageDefinition[] = StageRegistry.defaults()) {
    for (const definition of definitions) {
      if (definition.statuses.length === 0) throw new Error(`[LOOP_BLOCKED] stage ${definition.stage} must declare at least one status`);
      for (const status of definition.statuses) {
        if (this.byStatus.has(status)) throw new Error(`[LOOP_BLOCKED] duplicate stage status registration: ${status}`);
        this.byStatus.set(status, definition);
      }
    }
  }

  resolve(status: string): ExecutionStage | undefined {
    return this.byStatus.get(status)?.stage;
  }

  resolveNextStatus(state: LoopRuntimeState, stage: ExecutionStage): string | undefined {
    return this.byStatus.get(state.status)?.nextStatus?.(state, stage);
  }

  has(status: string): boolean {
    return this.byStatus.has(status);
  }

  definitions(): readonly StageDefinition[] {
    return [...new Map([...this.byStatus.values()].map((definition) => [definition.stage, definition])).values()];
  }

  static defaults(): readonly StageDefinition[] {
    return [
      {
        stage: 'GOAL_REVIEW',
        statuses: ['INIT', 'GOAL_REVIEW'],
        nextStatus: (state) => state.status === 'INIT' ? 'GOAL_REVIEW' : 'WAITING_FOR_GOAL_CONFIRMATION',
      },
      { stage: 'PLAN', statuses: ['PLAN'], nextStatus: () => 'IMPLEMENT' },
      { stage: 'IMPLEMENT', statuses: ['IMPLEMENT'], nextStatus: () => 'VERIFY' },
      {
        stage: 'VERIFY',
        statuses: ['VERIFY'],
        nextStatus: (state) => state.facts.verificationPassed ? 'REVIEW' : state.facts.verificationFailed ? 'FIX' : undefined,
      },
      {
        stage: 'REVIEW',
        statuses: ['REVIEW'],
        nextStatus: (state) => state.facts.reviewPassed ? 'READY_FOR_CONFIRMATION' : state.facts.reviewFailed ? 'FIX' : undefined,
      },
      { stage: 'FIX', statuses: ['FIX'], nextStatus: () => 'IMPLEMENT' },
    ];
  }
}
