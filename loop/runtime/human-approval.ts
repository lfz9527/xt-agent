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
    const state = this.assertActive(runId, gate);
    const revision = this.policy.currentRevision();
    if (state.policyRevision !== revision || state.snapshot.policyRevision !== revision) {
      this.blocked(state, 'policy revision mismatch; human approval cannot proceed');
      throw new Error('[LOOP_BLOCKED] policy revision mismatch; human approval cannot proceed');
    }
    this.audit?.append({ eventId: createRuntimeEventId('approval'), runId, type: 'APPROVAL_REQUESTED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { gate, reason } });

    const decision = await provider.request({ runId, gate, reason, policyRevision: state.policyRevision });
    const latest = this.assertActive(runId, gate);
    const currentRevision = this.policy.currentRevision();
    if (latest.policyRevision !== currentRevision || latest.snapshot.policyRevision !== currentRevision) {
      this.blocked(latest, 'policy revision changed while waiting for human approval');
      throw new Error('[LOOP_BLOCKED] policy revision changed while waiting for human approval');
    }
    this.resolve(runId, gate, decision);
    return decision;
  }

  resolve(runId: string, gate: HumanApprovalGateName, decision: HumanApprovalDecision): LoopRuntimeState {
    const state = this.assertActive(runId, gate);
    const currentRevision = this.policy.currentRevision();
    if (state.policyRevision !== currentRevision || state.snapshot.policyRevision !== currentRevision) {
      this.blocked(state, 'policy revision mismatch; human approval cannot be resolved');
      throw new Error('[LOOP_BLOCKED] policy revision mismatch; human approval cannot be resolved');
    }
    const facts = gate === 'execution'
      ? { ...state.facts, executionApprovalSatisfied: decision === 'approved' }
      : { ...state.facts, finalApprovalSatisfied: decision === 'approved', finalApprovalRejected: decision === 'rejected' };
    const next = { ...state, facts };
    this.stateStoreFactory(runId).write(next);
    this.audit?.append({ eventId: createRuntimeEventId('approval'), runId, type: 'APPROVAL_RESOLVED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { gate, decision } });
    return next;
  }

  private assertActive(runId: string, gate: HumanApprovalGateName): LoopRuntimeState {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');
    const state = this.stateStoreFactory(runId).read();
    if (!this.isWaitingFor(state.status, gate)) throw new Error(`[LOOP_BLOCKED] human approval gate ${gate} is not active in ${state.status}`);
    return state;
  }

  private isWaitingFor(status: string, gate: HumanApprovalGateName): boolean {
    return gate === 'execution' ? status === 'WAITING_FOR_GOAL_CONFIRMATION' : status === 'READY_FOR_CONFIRMATION';
  }

  private blocked(state: LoopRuntimeState, reason: string): void {
    this.audit?.append({ eventId: createRuntimeEventId('blocked'), runId: state.runId, type: 'BLOCKED', at: new Date().toISOString(), policyRevision: state.policyRevision, payload: { status: state.status, reason } });
  }
}
