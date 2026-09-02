import type { ExecutionStage } from './execution-runtime';

export interface StageDefinition {
  stage: ExecutionStage;
  /** 当前 Runtime Status 对应的阶段；同一 stage 可以映射多个入口状态。 */
  statuses: readonly string[];
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

  has(status: string): boolean {
    return this.byStatus.has(status);
  }

  definitions(): readonly StageDefinition[] {
    return [...new Map([...this.byStatus.values()].map((definition) => [definition.stage, definition])).values()];
  }

  static defaults(): readonly StageDefinition[] {
    return [
      { stage: 'GOAL_REVIEW', statuses: ['INIT', 'GOAL_REVIEW'] },
      { stage: 'PLAN', statuses: ['PLAN'] },
      { stage: 'IMPLEMENT', statuses: ['IMPLEMENT'] },
      { stage: 'VERIFY', statuses: ['VERIFY'] },
      { stage: 'REVIEW', statuses: ['REVIEW'] },
      { stage: 'FIX', statuses: ['FIX'] },
      { stage: 'READY_FOR_CONFIRMATION', statuses: ['READY_FOR_CONFIRMATION'] },
    ];
  }
}
