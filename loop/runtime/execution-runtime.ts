import { randomUUID } from 'node:crypto';
import type { LoopRuntimeState, LoopRuntimeKernel, StateStore } from './kernel';
import type { RunRuntime } from './run-runtime';
import { checkpointInputFingerprint, FileCheckpointStore, type CheckpointStore } from './checkpoint';
import type { HumanApprovalDecision, HumanApprovalGate, HumanApprovalGateName, HumanApprovalProvider } from './human-approval';
import { StageRegistry } from './stage-registry';
import type { RunArtifactStore } from './artifact-store';
import { RunArtifactStore as FileRunArtifactStore } from './artifact-store';
import { EvidenceCompletionGate, type CompletionEvidence } from './completion-gate';
import type { RunAuditTimeline } from './audit-timeline';

export type ExecutionStage = 'GOAL_REVIEW' | 'PLAN' | 'IMPLEMENT' | 'VERIFY' | 'REVIEW' | 'FIX' | 'READY_FOR_CONFIRMATION';
export interface StageResult { facts?: Partial<LoopRuntimeState['facts']>; checkpoint?: string; evidence?: CompletionEvidence[]; }
export interface StageExecutor { execute(stage: ExecutionStage, state: LoopRuntimeState): Promise<StageResult>; }
export interface ExecutionRuntimeOptions {
  workspace?: string;
  maxFixAttempts?: number;
  checkpointStore?: CheckpointStore;
  humanApprovalGate?: HumanApprovalGate;
  stageRegistry?: StageRegistry;
  artifactStore?: Pick<RunArtifactStore, 'writeEvidence'>;
  completionGate?: EvidenceCompletionGate;
  auditTimeline?: RunAuditTimeline;
}

/** P2-3/P2-4/P2-5 Execution Runtime：阶段、checkpoint、evidence 和完成决策均进入统一 Run Audit Timeline。 */
export class ExecutionRuntime {
  private readonly maxFixAttempts: number;
  private readonly checkpointStore?: CheckpointStore;
  private readonly humanApprovalGate?: HumanApprovalGate;
  private readonly stageRegistry: StageRegistry;
  private readonly artifactStore?: Pick<RunArtifactStore, 'writeEvidence'>;
  private readonly completionGate: EvidenceCompletionGate;
  private readonly auditTimeline?: RunAuditTimeline;

  constructor(
    private readonly runs: RunRuntime,
    private readonly kernel: LoopRuntimeKernel,
    private readonly stateStoreFactory: (runId: string) => StateStore,
    private readonly executor: StageExecutor,
    options: ExecutionRuntimeOptions = {},
  ) {
    this.maxFixAttempts = options.maxFixAttempts ?? 3;
    this.checkpointStore = options.checkpointStore ?? (options.workspace ? new FileCheckpointStore(options.workspace) : undefined);
    this.humanApprovalGate = options.humanApprovalGate;
    this.stageRegistry = options.stageRegistry ?? new StageRegistry();
    this.artifactStore = options.artifactStore ?? (options.workspace ? new FileRunArtifactStore({ workspace: options.workspace }) : undefined);
    this.completionGate = options.completionGate ?? new EvidenceCompletionGate();
    this.auditTimeline = options.auditTimeline;
    if (!Number.isInteger(this.maxFixAttempts) || this.maxFixAttempts < 1) throw new Error('[LOOP_BLOCKED] maxFixAttempts must be a positive integer');
  }

  async step(runId: string): Promise<LoopRuntimeState> {
    let state = this.runs.loadRun(runId);
    const stage = this.stageRegistry.resolve(state.status);
    if (!stage) return state;
    const recovered = this.recoverCheckpoint(state, stage);
    if (recovered) return recovered;

    if (stage === 'FIX') {
      const attempts = state.facts.fixAttempts + 1;
      if (attempts > this.maxFixAttempts) {
        this.updateFacts(runId, { fixAttempts: attempts, fixAttemptsWithinLimit: false });
        this.kernel.transition('BLOCKED');
        return this.runs.loadRun(runId);
      }
      this.updateFacts(runId, { fixAttempts: attempts, fixAttemptsWithinLimit: true });
      state = this.runs.loadRun(runId);
    }

    const inputFingerprint = checkpointInputFingerprint(runId, stage, state.policyRevision, state.facts as unknown as Record<string, unknown>);
    this.auditTimeline?.stage(runId, state.policyRevision, stage, 'started');
    let result: StageResult;
    try {
      result = await this.executor.execute(stage, state);
      this.auditTimeline?.stage(runId, state.policyRevision, stage, 'completed');
    } catch (error) {
      this.auditTimeline?.stage(runId, state.policyRevision, stage, 'failed');
      throw error;
    }
    return this.completeStageInternal(runId, result, inputFingerprint, stage);
  }

  /** Agent-facing stage completion boundary. The Agent supplies results; Runtime owns persistence, gates and transition. */
  completeStage(runId: string, result: StageResult): LoopRuntimeState {
    const state = this.runs.loadRun(runId);
    const stage = this.stageRegistry.resolve(state.status);
    if (!stage) throw new Error(`[LOOP_BLOCKED] status ${state.status} is not an executable stage`);
    const inputFingerprint = checkpointInputFingerprint(runId, stage, state.policyRevision, state.facts as unknown as Record<string, unknown>);
    return this.completeStageInternal(runId, result, inputFingerprint, stage);
  }

  private completeStageInternal(runId: string, result: StageResult, inputFingerprint: string, stage: ExecutionStage): LoopRuntimeState {
    let state = this.runs.loadRun(runId);
    if (result.facts) {
      this.updateFacts(runId, result.facts);
      state = this.runs.loadRun(runId);
    }
    if (result.evidence) {
      for (const evidence of result.evidence) {
        if (evidence.runId !== runId) throw new Error('[LOOP_BLOCKED] evidence belongs to another run');
        if (this.artifactStore) this.artifactStore.writeEvidence(runId, evidence.id, `${JSON.stringify(evidence, null, 2)}\n`);
        this.auditTimeline?.evidence(runId, state.policyRevision, evidence);
      }
    }
    const next = this.stageRegistry.resolveNextStatus(state, stage);

    if (next === 'DONE') {
      const completion = this.completionGate.evaluate(state, result.evidence ?? []);
      if (!completion.allowed) {
        this.kernel.transition('BLOCKED');
        throw new Error(`[LOOP_BLOCKED] ${completion.reason}`);
      }
    }

    if (this.checkpointStore) {
      const checkpointId = result.checkpoint ?? randomUUID();
      this.checkpointStore.write({
        schemaVersion: 1,
        runId,
        stage,
        checkpointId,
        inputFingerprint,
        facts: state.facts as unknown as Record<string, unknown>,
        nextStatus: next,
        completedAt: new Date().toISOString(),
      });
      this.auditTimeline?.checkpoint(runId, state.policyRevision, checkpointId, stage, next);
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

  requestHumanApproval(runId: string, gate: HumanApprovalGateName, reason: string, provider: HumanApprovalProvider): Promise<HumanApprovalDecision> {
    if (!this.humanApprovalGate) throw new Error('[LOOP_BLOCKED] human approval gate is required');
    return this.humanApprovalGate.request(runId, gate, reason, provider);
  }

  resolveHumanApproval(runId: string, gate: HumanApprovalGateName, decision: HumanApprovalDecision): LoopRuntimeState {
    if (!this.humanApprovalGate) throw new Error('[LOOP_BLOCKED] human approval gate is required');
    return this.humanApprovalGate.resolve(runId, gate, decision);
  }

  resetFixAttempts(runId: string): void {
    const state = this.runs.loadRun(runId);
    this.stateStoreFactory(runId).write({ ...state, facts: { ...state.facts, fixAttempts: 0, fixAttemptsWithinLimit: true } });
  }

  private recoverCheckpoint(state: LoopRuntimeState, stage: ExecutionStage): LoopRuntimeState | undefined {
    if (!this.checkpointStore) return undefined;
    const checkpoint = this.checkpointStore.read(state.runId);
    if (!checkpoint || checkpoint.stage !== stage) return undefined;
    const expected = checkpointInputFingerprint(state.runId, stage, state.policyRevision, state.facts as unknown as Record<string, unknown>);
    if (checkpoint.inputFingerprint !== expected) throw new Error('[LOOP_BLOCKED] execution checkpoint input fingerprint does not match runtime state');
    this.stateStoreFactory(state.runId).write({ ...state, facts: { ...state.facts, ...checkpoint.facts } });
    this.auditTimeline?.checkpoint(state.runId, state.policyRevision, checkpoint.checkpointId, stage, checkpoint.nextStatus);
    if (checkpoint.nextStatus) this.kernel.transition(checkpoint.nextStatus);
    this.checkpointStore.clear(state.runId);
    return this.runs.loadRun(state.runId);
  }

  private updateFacts(runId: string, facts: Partial<LoopRuntimeState['facts']>): void {
    const store = this.stateStoreFactory(runId);
    const state = store.read();
    store.write({ ...state, facts: { ...state.facts, ...facts } });
  }
}
