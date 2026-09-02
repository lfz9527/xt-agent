import type { LoopRuntimeState, StateStore } from './kernel';
import { createRuntimeEventId, type RuntimeAuditLog } from './persistence';

export type HumanApprovalGateName = 'execution' | 'final';
export type HumanApprovalDecision = 'approved' | 'rejected';

export interface HumanApprovalRequest {
  runId: string;
  gate: HumanApprovalGateName;
  reason: string;
  policyRevision: number;
}

export interface HumanApprovalProvider {
  request(input: HumanApprovalRequest): Promise<HumanApprovalDecision>;
}

/**
 * 统一人工审批闸门：所有 Run 级人工确认都必须通过这里，并将结果持久化为 Runtime Facts。
 * Capability 级 approval 仍由 Kernel 的 ApprovalProvider 负责，两者边界不能混淆。
 */
export class HumanApprovalGate {
  constructor(
    private readonly stateStoreFactory: (runId: string) => StateStore,
    private readonly policy: { currentRevision(): number },
    private readonly audit?: RuntimeAuditLog,
  ) {}

  async request(runId: string, gate: HumanApprovalGateName, reason: string, provider: HumanApprovalProvider): Promise<HumanApprovalDecision> {
    const state = this.load(runId);
    const revision = this.policy.currentRevision();
    if (state.policyRevision !== revision || state.snapshot.policyRevision !== revision) {
      this.blocked(state, 'policy revision mismatch; human approval cannot proceed');
      throw new Error('[LOOP_BLOCKED] policy revision mismatch; human approval cannot proceed');
    }
    if (!this.isWaitingFor(state.status, gate)) {
      throw new Error(`[LOOP_BLOCKED] human approval gate ${gate} is not active in ${state.status}`);
    }

    this.audit?.append({
      eventId: createRuntimeEventId('approval'),
      runId,
      type: 'APPROVAL_REQUESTED',
      at: new Date().toISOString(),
      policyRevision: state.policyRevision,
      payload: { gate, reason },
    });

    const decision = await provider.request({ runId, gate, reason, policyRevision: state.policyRevision });
    const latest = this.load(runId);
    const currentRevision = this.policy.currentRevision();
    if (latest.policyRevision !== currentRevision || latest.snapshot.policyRevision !== currentRevision) {
      this.blocked(latest, 'policy revision changed while waiting for human approval');
      throw new Error('[LOOP_BLOCKED] policy revision changed while waiting for human approval');
    }
    if (!this.isWaitingFor(latest.status, gate)) {
      this.blocked(latest, `human approval gate ${gate} is no longer active`);
      throw new Error(`[LOOP_BLOCKED] human approval gate ${gate} is no longer active`);
    }

    this.resolve(runId, gate, decision);
    this.audit?.append({
      eventId: createRuntimeEventId('approval'),
      runId,
      type: 'APPROVAL_RESOLVED',
      at: new Date().toISOString(),
      policyRevision: latest.policyRevision,
      payload: { gate, decision },
    });
    return decision;
  }

  resolve(runId: string, gate: HumanApprovalGateName, decision: HumanApprovalDecision): LoopRuntimeState {
    const state = this.load(runId);
    if (!this.isWaitingFor(state.status, gate)) {
      throw new Error(`[LOOP_BLOCKED] human approval gate ${gate} is not active in ${state.status}`);
    }
    const facts = gate === 'execution'
      ? { ...state.facts, executionApprovalSatisfied: decision === 'approved' }
      : { ...state.facts, finalApprovalSatisfied: decision === 'approved', finalApprovalRejected: decision === 'rejected' };
    const next = { ...state, facts };
    this.stateStoreFactory(runId).write(next);
    return next;
  }

  private load(runId: string): LoopRuntimeState {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');
    return this.stateStoreFactory(runId).read();
  }

  private isWaitingFor(status: string, gate: HumanApprovalGateName): boolean {
    return gate === 'execution' ? status === 'WAITING_FOR_GOAL_CONFIRMATION' : status === 'READY_FOR_CONFIRMATION';
  }

  private blocked(state: LoopRuntimeState, reason: string): void {
    this.audit?.append({
      eventId: createRuntimeEventId('blocked'),
      runId: state.runId,
      type: 'BLOCKED',
      at: new Date().toISOString(),
      policyRevision: state.policyRevision,
      payload: { status: state.status, reason },
    });
  }
}
