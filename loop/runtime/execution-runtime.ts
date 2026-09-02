import { randomUUID } from 'node:crypto';
import type { LoopRuntimeState, LoopRuntimeKernel, StateStore } from './kernel';
import type { RunRuntime } from './run-runtime';
import { checkpointInputFingerprint, type CheckpointStore } from './checkpoint';

export type ExecutionStage = 'GOAL_REVIEW' | 'PLAN' | 'IMPLEMENT' | 'VERIFY' | 'REVIEW' | 'FIX' | 'READY_FOR_CONFIRMATION';
export interface StageResult { facts?: Partial<LoopRuntimeState['facts']>; checkpoint?: string; }
export interface StageExecutor { execute(stage: ExecutionStage, state: LoopRuntimeState): Promise<StageResult>; }
export interface ExecutionRuntimeOptions { maxFixAttempts?: number; checkpointStore?: CheckpointStore; }

/** P2-3 Execution Runtime：阶段完成后持久化 checkpoint；重启后优先恢复 checkpoint，避免重复调用 Agent/Tool。 */
export class ExecutionRuntime {
  private readonly fixAttempts = new Map<string, number>();
  private readonly maxFixAttempts: number;
  private readonly checkpointStore?: CheckpointStore;

  constructor(
    private readonly runs: RunRuntime,
    private readonly kernel: LoopRuntimeKernel,
    private readonly stateStoreFactory: (runId: string) => StateStore,
    private readonly executor: StageExecutor,
    options: ExecutionRuntimeOptions = {},
  ) {
    this.maxFixAttempts = options.maxFixAttempts ?? 3;
    this.checkpointStore = options.checkpointStore;
    if (!Number.isInteger(this.maxFixAttempts) || this.maxFixAttempts < 1) throw new Error('[LOOP_BLOCKED] maxFixAttempts must be a positive integer');
  }

  async step(runId: string): Promise<LoopRuntimeState> {
    let state = this.runs.loadRun(runId);
    const stage = this.stageFor(state.status);
    if (!stage) return state;
    const recovered = this.recoverCheckpoint(state, stage);
    if (recovered) return recovered;

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

    // checkpoint fingerprint 必须绑定到 Agent/Tool 执行前的输入状态。
    const inputFingerprint = checkpointInputFingerprint(runId, stage, state.policyRevision, state.facts as unknown as Record<string, unknown>);

    const result = await this.executor.execute(stage, state);
    if (result.facts) { this.updateFacts(runId, result.facts); state = this.runs.loadRun(runId); }
    const next = this.nextStatus(state, stage);

    if (this.checkpointStore) {
      this.checkpointStore.write({
        schemaVersion: 1,
        runId,
        stage,
        checkpointId: result.checkpoint ?? randomUUID(),
        inputFingerprint,
        facts: state.facts as unknown as Record<string, unknown>,
        nextStatus: next,
        completedAt: new Date().toISOString(),
      });
    }
    if (next) this.kernel.transition(next);
    if (next && this.checkpointStore) this.checkpointStore.clear(runId);
    return this.runs.loadRun(runId);
  }

  async runUntilHalt(runId: string): Promise<LoopRuntimeState> {
    for (;;) {
      const state = this.runs.loadRun(runId);
      if (['PAUSED', 'DONE', 'BLOCKED', 'WAITING_FOR_GOAL_CONFIRMATION', 'READY_FOR_CONFIRMATION'].includes(state.status)) return state;
      await this.step(runId);
    }
  }

  resetFixAttempts(runId: string): void { this.fixAttempts.delete(runId); }

  private recoverCheckpoint(state: LoopRuntimeState, stage: ExecutionStage): LoopRuntimeState | undefined {
    if (!this.checkpointStore) return undefined;
    const checkpoint = this.checkpointStore.read(state.runId);
    if (!checkpoint || checkpoint.stage !== stage) return undefined;
    const expected = checkpointInputFingerprint(state.runId, stage, state.policyRevision, state.facts as unknown as Record<string, unknown>);
    if (checkpoint.inputFingerprint !== expected) throw new Error('[LOOP_BLOCKED] execution checkpoint input fingerprint does not match runtime state');
    this.stateStoreFactory(state.runId).write({ ...state, facts: { ...state.facts, ...checkpoint.facts } });
    if (checkpoint.nextStatus) this.kernel.transition(checkpoint.nextStatus);
    this.checkpointStore.clear(state.runId);
    return this.runs.loadRun(state.runId);
  }

  private updateFacts(runId: string, facts: Partial<LoopRuntimeState['facts']>): void { const store = this.stateStoreFactory(runId); const state = store.read(); store.write({ ...state, facts: { ...state.facts, ...facts } }); }
  private stageFor(status: string): ExecutionStage | undefined { return ({ INIT: 'GOAL_REVIEW', GOAL_REVIEW: 'GOAL_REVIEW', PLAN: 'PLAN', IMPLEMENT: 'IMPLEMENT', VERIFY: 'VERIFY', REVIEW: 'REVIEW', FIX: 'FIX' } as Record<string, ExecutionStage>)[status]; }
  private nextStatus(state: LoopRuntimeState, stage: ExecutionStage): string | undefined {
    switch (stage) {
      case 'GOAL_REVIEW': return state.status === 'INIT' ? 'GOAL_REVIEW' : 'WAITING_FOR_GOAL_CONFIRMATION';
      case 'PLAN': return 'IMPLEMENT';
      case 'IMPLEMENT': return 'VERIFY';
      case 'VERIFY': return state.facts.verificationPassed ? 'REVIEW' : state.facts.verificationFailed ? 'FIX' : undefined;
      case 'REVIEW': return state.facts.reviewPassed ? 'READY_FOR_CONFIRMATION' : state.facts.reviewFailed ? 'FIX' : undefined;
      case 'FIX': return 'IMPLEMENT';
      default: return undefined;
    }
  }
}
