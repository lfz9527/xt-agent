import { enforceCapability, enforceTransition, type EnforcementContext, type EnforcementResult, type PolicySnapshot, type RuntimeFacts, type TransitionGuardContext } from './enforcement';
import { evaluateResourceMutation, type RuntimeResourcePolicy } from './resource-policy';
import { createRuntimeEventId, type MutationJournal, type RuntimeAuditLog } from './persistence';
import { RuntimeResourceLock } from './lock';
import { verifyGitBaseline } from './git-consistency';
import type { GitBaseline } from './git-consistency';

export interface LoopRuntimeState {
  runId: string;
  status: string;
  policyRevision: number;
  snapshot: PolicySnapshot;
  facts: RuntimeFacts;
  gitBaseline?: GitBaseline;
  expectedWorktreeFingerprint?: string;
}

export interface StateStore { read(): LoopRuntimeState; write(next: LoopRuntimeState): void; }
export interface PolicyRevisionSource { currentRevision(): number; }
export interface CapabilityExecutor<T> { execute(): Promise<T>; }
export interface ApprovalProvider { request(input: { runId: string; capability: string; reason: string }): Promise<'approved' | 'rejected'>; }
export interface ResourceMutationExecutor<T> { execute(): Promise<T>; }

export class LoopRuntimeKernel {
  constructor(
    private readonly stateStore: StateStore,
    private readonly policy: PolicyRevisionSource,
    private readonly approval?: ApprovalProvider,
    private readonly audit?: RuntimeAuditLog,
    private readonly resourceLock?: RuntimeResourceLock,
    private readonly mutationJournal?: MutationJournal,
    private readonly gitCwd: string = '.',
  ) {}

  async executeCapability<T>(
    input: Omit<EnforcementContext, 'runId' | 'policyRevision' | 'currentPolicyRevision' | 'snapshot' | 'approvalDecision'> & { approvalDecision?: EnforcementContext['approvalDecision'] },
    executor: CapabilityExecutor<T>,
  ): Promise<T> {
    const state = this.stateStore.read();
    const currentRevision = this.policy.currentRevision();
    let approvalDecision = input.approvalDecision ?? 'required';
    let result = this.enforce({ ...input, runId: state.runId, policyRevision: state.policyRevision, currentPolicyRevision: currentRevision, snapshot: state.snapshot, approvalDecision });
    if (result.status === 'CONFIRM') {
      if (!this.approval) { this.blocked(state, 'approval provider is required for a confirm decision'); throw new Error('approval provider is required for a confirm decision'); }
      this.audit?.append({ eventId: createRuntimeEventId('approval'), runId: state.runId, type: 'APPROVAL_REQUESTED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { capability: input.capability, reason: result.reason } });
      approvalDecision = await this.approval.request({ runId: state.runId, capability: input.capability, reason: result.reason });
      this.audit?.append({ eventId: createRuntimeEventId('approval'), runId: state.runId, type: 'APPROVAL_RESOLVED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { capability: input.capability, decision: approvalDecision } });
      result = this.enforce({ ...input, runId: state.runId, policyRevision: state.policyRevision, currentPolicyRevision: this.policy.currentRevision(), snapshot: state.snapshot, approvalDecision });
    }
    if (!result.allowed) { this.blocked(state, result.reason); throw new Error(`[LOOP_${result.status}] ${result.reason}`); }
    return executor.execute();
  }

  /** 唯一资源 mutation 入口：Policy → Capability → Git Consistency → Lock → Mutation → Journal。 */
  async mutateResource<T>(resourcePolicy: RuntimeResourcePolicy, capability: string, path: string, executor: ResourceMutationExecutor<T>): Promise<T> {
    const state = this.stateStore.read();
    if (!state.gitBaseline || state.expectedWorktreeFingerprint === undefined) {
      this.blocked(state, 'git baseline and expected worktree state are required for mutation');
      throw new Error('[LOOP_BLOCKED] git baseline and expected worktree state are required for mutation');
    }
    if (!this.mutationJournal) {
      this.blocked(state, 'mutation journal is required for mutation');
      throw new Error('[LOOP_BLOCKED] mutation journal is required for mutation');
    }
    const decision = evaluateResourceMutation({ policy: resourcePolicy, capability, path });
    if (!decision.allowed) { this.blocked(state, decision.reason); throw new Error(`[LOOP_DENY] ${decision.reason}`); }

    const before = verifyGitBaseline(this.gitCwd, state.gitBaseline, state.expectedWorktreeFingerprint);
    if (!before.consistent) { this.blocked(state, before.reason); throw new Error(`[LOOP_BLOCKED] ${before.reason}`); }
    if (!this.resourceLock) { this.blocked(state, `resource lock is required for mutation: ${path}`); throw new Error('[LOOP_BLOCKED] resource lock is required for mutation'); }

    this.resourceLock.acquire(path, state.runId);
    try {
      this.resourceLock.assertOwned(path, state.runId);
      const result = await executor.execute();
      const after = verifyGitBaseline(this.gitCwd, state.gitBaseline);
      if (!after.consistent) { this.blocked(state, after.reason); throw new Error(`[LOOP_BLOCKED] ${after.reason}`); }
      this.mutationJournal.append({ mutationId: createRuntimeEventId('mutation'), runId: state.runId, resource: path, capability, at: new Date().toISOString(), beforeWorktreeFingerprint: before.current.worktreeFingerprint, afterWorktreeFingerprint: after.current.worktreeFingerprint, result: 'committed' });
      this.audit?.append({ eventId: createRuntimeEventId('mutation'), runId: state.runId, type: 'RESOURCE_MUTATION', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { resource: path, capability, before: before.current.worktreeFingerprint, after: after.current.worktreeFingerprint } });
      this.stateStore.write({ ...state, expectedWorktreeFingerprint: after.current.worktreeFingerprint });
      return result;
    } catch (error) {
      let current = before.current.worktreeFingerprint;
      try { current = verifyGitBaseline(this.gitCwd, state.gitBaseline).current.worktreeFingerprint; } catch { /* Git itself may be unavailable after a failed mutation. */ }
      this.mutationJournal.append({ mutationId: createRuntimeEventId('mutation'), runId: state.runId, resource: path, capability, at: new Date().toISOString(), beforeWorktreeFingerprint: before.current.worktreeFingerprint, afterWorktreeFingerprint: current, result: 'failed' });
      throw error;
    } finally {
      this.resourceLock.release(path, state.runId);
    }
  }

  transition(to: string): void {
    if (!this.resourceLock) throw new Error('[LOOP_BLOCKED] state lock is required for transition');
    const initialState = this.stateStore.read();
    const lockResource = this.stateLockResource(initialState.runId);
    this.resourceLock.acquire(lockResource, initialState.runId);
    try {
      this.resourceLock.assertOwned(lockResource, initialState.runId);
      const state = this.stateStore.read();
      if (state.runId !== initialState.runId) throw new Error('[LOOP_BLOCKED] runtime run identity changed while acquiring state lock');
      if (state.policyRevision !== this.policy.currentRevision()) { this.blocked(state, 'policy revision mismatch'); throw new Error('[LOOP_BLOCKED] policy revision mismatch'); }
      const context: TransitionGuardContext = { from: state.status, to, facts: state.facts, guards: { policyRevisionMatch: true } };
      if (!enforceTransition(context)) { this.blocked(state, `transition ${state.status} -> ${to} failed its guards`); throw new Error(`[LOOP_BLOCKED] transition ${state.status} -> ${to} failed its guards`); }
      this.stateStore.write({ ...state, status: to });
      this.audit?.append({ eventId: createRuntimeEventId('transition'), runId: state.runId, type: 'STATE_TRANSITION', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { from: state.status, to } });
    } finally { this.resourceLock.release(lockResource, initialState.runId); }
  }

  private stateLockResource(runId: string): string { return `runtime-state/${runId}`; }
  private enforce(context: EnforcementContext): EnforcementResult { return enforceCapability(context); }
  private blocked(state: LoopRuntimeState, reason: string): void { this.audit?.append({ eventId: createRuntimeEventId('blocked'), runId: state.runId, type: 'BLOCKED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { status: state.status, reason } }); }
}
