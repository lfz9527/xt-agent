import { randomUUID } from 'node:crypto';
import { captureGitBaseline } from './git-consistency';
import { canResume } from './enforcement';
import type { PolicySnapshot, RuntimeFacts } from './enforcement';
import type { GitBaseline } from './git-consistency';
import type { LoopRuntimeState, StateStore } from './kernel';

export interface RunRuntimePolicySource {
  currentRevision(): number;
  createSnapshot(runId: string): PolicySnapshot;
}

export interface RunRuntimeOptions {
  gitCwd?: string;
  createRunId?: () => string;
  initialFacts?: Partial<RuntimeFacts>;
}

const defaultFacts = (): RuntimeFacts => ({
  executionApprovalSatisfied: false,
  planArtifactExists: false,
  implementationCompleted: false,
  verificationPassed: false,
  verificationFailed: false,
  reviewPassed: false,
  reviewFailed: false,
  acceptancePassed: false,
  finalApprovalSatisfied: false,
  finalApprovalRejected: false,
  fixAttemptsWithinLimit: true,
  resumeRequested: false,
  resumeStateValid: false,
  pauseExpired: false,
});

/**
 * P2 Run Runtime：统一负责 Run 的创建、暂停、恢复和完成状态持久化。
 * 具体 Capability、Resource Mutation 和 Transition Enforcement 仍由 Kernel 执行。
 */
export class RunRuntime {
  constructor(
    private readonly stateStoreFactory: (runId: string) => StateStore,
    private readonly policy: RunRuntimePolicySource,
    private readonly options: RunRuntimeOptions = {},
  ) {}

  createRun(): LoopRuntimeState {
    const runId = this.options.createRunId?.() ?? randomUUID();
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');

    const snapshot = this.policy.createSnapshot(runId);
    if (snapshot.runId !== runId) throw new Error('[LOOP_BLOCKED] policy snapshot belongs to another run');
    const revision = this.policy.currentRevision();
    if (snapshot.policyRevision !== revision) throw new Error('[LOOP_BLOCKED] policy snapshot revision is stale');

    const gitBaseline = captureGitBaseline(this.options.gitCwd ?? '.');
    const state: LoopRuntimeState = {
      runId,
      status: 'INIT',
      policyRevision: revision,
      snapshot,
      facts: { ...defaultFacts(), ...this.options.initialFacts },
      gitBaseline,
      expectedWorktreeFingerprint: gitBaseline.worktreeFingerprint,
    };
    this.stateStoreFactory(runId).write(state);
    return state;
  }

  loadRun(runId: string): LoopRuntimeState {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');
    const state = this.stateStoreFactory(runId).read();
    this.assertPolicy(state);
    return state;
  }

  pause(runId: string): LoopRuntimeState {
    const state = this.loadRun(runId);
    if (state.status === 'DONE' || state.status === 'BLOCKED') {
      throw new Error(`[LOOP_BLOCKED] run in ${state.status} cannot be paused`);
    }
    const next = { ...state, status: 'PAUSED', facts: { ...state.facts, resumeRequested: false, resumeStateValid: true } };
    this.stateStoreFactory(runId).write(next);
    return next;
  }

  resume(runId: string): LoopRuntimeState {
    const state = this.loadRun(runId);
    if (!canResume(state.status, true, state.facts.resumeStateValid)) {
      throw new Error('[LOOP_BLOCKED] only a valid PAUSED run can be resumed');
    }
    const next = { ...state, facts: { ...state.facts, resumeRequested: true } };
    this.stateStoreFactory(runId).write(next);
    return next;
  }

  complete(runId: string): LoopRuntimeState {
    const state = this.loadRun(runId);
    if (state.status !== 'READY_FOR_CONFIRMATION') {
      throw new Error('[LOOP_BLOCKED] only a run ready for confirmation can be completed');
    }
    const { acceptancePassed, verificationPassed, reviewPassed, finalApprovalSatisfied } = state.facts;
    if (!acceptancePassed || !verificationPassed || !reviewPassed || !finalApprovalSatisfied) {
      throw new Error('[LOOP_BLOCKED] completion acceptance gates are not satisfied');
    }
    const next = { ...state, status: 'DONE' };
    this.stateStoreFactory(runId).write(next);
    return next;
  }

  private assertPolicy(state: LoopRuntimeState): void {
    const currentRevision = this.policy.currentRevision();
    if (state.policyRevision !== currentRevision || state.snapshot.policyRevision !== currentRevision) {
      throw new Error('[LOOP_BLOCKED] policy revision mismatch; run must not resume');
    }
    if (state.snapshot.runId !== state.runId) {
      throw new Error('[LOOP_BLOCKED] policy snapshot belongs to another run');
    }
  }
}

export type { GitBaseline };
