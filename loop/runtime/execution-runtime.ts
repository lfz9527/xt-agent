import type { LoopRuntimeState, LoopRuntimeKernel, StateStore } from './kernel';
import type { RunRuntime } from './run-runtime';

export type ExecutionStage =
  | 'GOAL_REVIEW'
  | 'PLAN'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'FIX'
  | 'READY_FOR_CONFIRMATION';

export interface StageResult {
  facts?: Partial<LoopRuntimeState['facts']>;
  checkpoint?: string;
}

export interface StageExecutor {
  execute(stage: ExecutionStage, state: LoopRuntimeState): Promise<StageResult>;
}

export interface ExecutionRuntimeOptions {
  maxFixAttempts?: number;
}

/**
 * P2-3 Execution Runtime：把 Run Lifecycle、State Guard 和 Stage Executor 串成可恢复的执行循环。
 * 每个阶段都先执行，再 checkpoint facts，最后通过 Kernel 做受保护的状态迁移。
 */
export class ExecutionRuntime {
  private readonly fixAttempts = new Map<string, number>();
  private readonly maxFixAttempts: number;

  constructor(
    private readonly runs: RunRuntime,
    private readonly kernel: LoopRuntimeKernel,
    private readonly stateStoreFactory: (runId: string) => StateStore,
    private readonly executor: StageExecutor,
    options: ExecutionRuntimeOptions = {},
  ) {
    this.maxFixAttempts = options.maxFixAttempts ?? 3;
    if (!Number.isInteger(this.maxFixAttempts) || this.maxFixAttempts < 1) {
      throw new Error('[LOOP_BLOCKED] maxFixAttempts must be a positive integer');
    }
  }

  /** 执行一个 checkpoint-safe step；不会跨越多个业务阶段。 */
  async step(runId: string): Promise<LoopRuntimeState> {
    let state = this.runs.loadRun(runId);
    const stage = this.stageFor(state.status);
    if (!stage) return state;

    if (stage === 'FIX') {
      const attempts = (this.fixAttempts.get(runId) ?? 0) + 1;
      if (attempts > this.maxFixAttempts) {
        this.updateFacts(runId, { fixAttemptsWithinLimit: false });
        this.kernel.transition('BLOCKED');
        return this.runs.loadRun(runId);
      }
      this.fixAttempts.set(runId, attempts);
      this.updateFacts(runId, { fixAttemptsWithinLimit: true });
      state = this.runs.loadRun(runId);
    }

    const result = await this.executor.execute(stage, state);
    if (result.facts) {
      this.updateFacts(runId, result.facts);
      state = this.runs.loadRun(runId);
    }

    const next = this.nextStatus(state, stage);
    if (next) this.kernel.transition(next);
    return this.runs.loadRun(runId);
  }

  /** 从当前 checkpoint 持续推进，直到等待人工确认、暂停、完成或阻塞。 */
  async runUntilHalt(runId: string): Promise<LoopRuntimeState> {
    for (;;) {
      const state = this.runs.loadRun(runId);
      if (['PAUSED', 'DONE', 'BLOCKED', 'WAITING_FOR_GOAL_CONFIRMATION', 'READY_FOR_CONFIRMATION'].includes(state.status)) {
        return state;
      }
      await this.step(runId);
    }
  }

  /** 清理某个 Run 的内存 retry 计数；持久化事实仍以 Runtime State 为准。 */
  resetFixAttempts(runId: string): void {
    this.fixAttempts.delete(runId);
  }

  private updateFacts(runId: string, facts: Partial<LoopRuntimeState['facts']>): void {
    const store = this.stateStoreFactory(runId);
    const state = store.read();
    store.write({ ...state, facts: { ...state.facts, ...facts } });
  }

  private stageFor(status: string): ExecutionStage | undefined {
    const stages: Record<string, ExecutionStage> = {
      INIT: 'GOAL_REVIEW',
      GOAL_REVIEW: 'GOAL_REVIEW',
      PLAN: 'PLAN',
      IMPLEMENT: 'IMPLEMENT',
      VERIFY: 'VERIFY',
      REVIEW: 'REVIEW',
      FIX: 'FIX',
    };
    return stages[status];
  }

  private nextStatus(state: LoopRuntimeState, stage: ExecutionStage): string | undefined {
    switch (stage) {
      case 'GOAL_REVIEW':
        return state.status === 'INIT' ? 'GOAL_REVIEW' : 'WAITING_FOR_GOAL_CONFIRMATION';
      case 'PLAN':
        return 'IMPLEMENT';
      case 'IMPLEMENT':
        return 'VERIFY';
      case 'VERIFY':
        return state.facts.verificationPassed ? 'REVIEW' : state.facts.verificationFailed ? 'FIX' : undefined;
      case 'REVIEW':
        return state.facts.reviewPassed ? 'READY_FOR_CONFIRMATION' : state.facts.reviewFailed ? 'FIX' : undefined;
      case 'FIX':
        return 'IMPLEMENT';
      default:
        return undefined;
    }
  }
}
