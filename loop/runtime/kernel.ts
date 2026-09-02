import { enforceCapability, enforceTransition, type EnforcementContext, type EnforcementResult, type PolicySnapshot, type TransitionGuardContext } from './enforcement';

export interface LoopRuntimeState {
  runId: string;
  status: string;
  policyRevision: number;
  snapshot: PolicySnapshot;
}

export interface StateStore {
  read(): LoopRuntimeState;
  write(next: LoopRuntimeState): void;
}

export interface PolicyRevisionSource {
  currentRevision(): number;
}

export interface CapabilityExecutor<T> {
  execute(): Promise<T>;
}

export interface ApprovalProvider {
  request(input: { runId: string; capability: string; reason: string }): Promise<'approved' | 'rejected'>;
}

export class LoopRuntimeKernel {
  constructor(
    private readonly stateStore: StateStore,
    private readonly policy: PolicyRevisionSource,
    private readonly approval?: ApprovalProvider,
  ) {}

  /**
   * 所有 Capability 必须从这里进入实际 Executor。
   * Executor 本身不负责安全决策，Kernel 在调用前完成全部 Gate。
   */
  async executeCapability<T>(
    input: Omit<EnforcementContext, 'runId' | 'policyRevision' | 'currentPolicyRevision' | 'snapshot' | 'approvalDecision'> & {
      approvalDecision?: EnforcementContext['approvalDecision'];
    },
    executor: CapabilityExecutor<T>,
  ): Promise<T> {
    const state = this.stateStore.read();
    const currentRevision = this.policy.currentRevision();
    let approvalDecision = input.approvalDecision ?? 'required';

    let result = this.enforce({
      ...input,
      runId: state.runId,
      policyRevision: state.policyRevision,
      currentPolicyRevision: currentRevision,
      snapshot: state.snapshot,
      approvalDecision,
    });

    if (result.status === 'CONFIRM') {
      if (!this.approval) throw new Error('approval provider is required for a confirm decision');
      approvalDecision = await this.approval.request({ runId: state.runId, capability: input.capability, reason: result.reason });
      result = this.enforce({
        ...input,
        runId: state.runId,
        policyRevision: state.policyRevision,
        currentPolicyRevision: this.policy.currentRevision(),
        snapshot: state.snapshot,
        approvalDecision,
      });
    }

    if (!result.allowed) throw new Error(`[LOOP_${result.status}] ${result.reason}`);
    return executor.execute();
  }

  /** 状态只能通过 Kernel 转移，禁止调用方直接写入 status。 */
  transition(to: string, guards: Record<string, boolean>): void {
    const state = this.stateStore.read();
    const currentRevision = this.policy.currentRevision();
    if (state.policyRevision !== currentRevision) {
      throw new Error('[LOOP_BLOCKED] policy revision mismatch');
    }
    const context: TransitionGuardContext = { from: state.status, to, guards: { ...guards, policyRevisionMatch: true } };
    if (!enforceTransition(context)) {
      throw new Error(`[LOOP_BLOCKED] transition ${state.status} -> ${to} failed its guards`);
    }
    this.stateStore.write({ ...state, status: to });
  }

  private enforce(context: EnforcementContext): EnforcementResult {
    return enforceCapability(context);
  }
}
