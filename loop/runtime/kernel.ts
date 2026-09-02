import { enforceCapability, enforceTransition, type EnforcementContext, type EnforcementResult, type PolicySnapshot, type TransitionGuardContext } from './enforcement';
import { evaluateResourceMutation, type RuntimeResourcePolicy } from './resource-policy';
import { createRuntimeEventId, type RuntimeAuditLog } from './persistence';
import { RuntimeResourceLock } from './lock';

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

export interface ResourceMutationExecutor<T> {
  execute(): Promise<T>;
}

export class LoopRuntimeKernel {
  constructor(
    private readonly stateStore: StateStore,
    private readonly policy: PolicyRevisionSource,
    private readonly approval?: ApprovalProvider,
    private readonly audit?: RuntimeAuditLog,
    private readonly resourceLock?: RuntimeResourceLock,
  ) {}

  /** 所有 Capability 必须从这里进入实际 Executor；Executor 不负责安全决策。 */
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
      if (!this.approval) {
        this.blocked(state, 'approval provider is required for a confirm decision');
        throw new Error('approval provider is required for a confirm decision');
      }
      this.audit?.append({
        eventId: createRuntimeEventId('approval'),
        runId: state.runId,
        type: 'APPROVAL_REQUESTED',
        at: new Date().toISOString(),
        policyRevision: state.policyRevision,
        payload: { capability: input.capability, reason: result.reason },
      });
      approvalDecision = await this.approval.request({ runId: state.runId, capability: input.capability, reason: result.reason });
      this.audit?.append({
        eventId: createRuntimeEventId('approval'),
        runId: state.runId,
        type: 'APPROVAL_RESOLVED',
        at: new Date().toISOString(),
        policyRevision: state.policyRevision,
        payload: { capability: input.capability, decision: approvalDecision },
      });
      result = this.enforce({
        ...input,
        runId: state.runId,
        policyRevision: state.policyRevision,
        currentPolicyRevision: this.policy.currentRevision(),
        snapshot: state.snapshot,
        approvalDecision,
      });
    }

    if (!result.allowed) {
      this.blocked(state, result.reason);
      throw new Error(`[LOOP_${result.status}] ${result.reason}`);
    }
    return executor.execute();
  }

  /**
   * 对资源执行实际修改。
   * Resource Policy 决定“能不能改”，Resource Lock 决定“现在谁可以改”。
   */
  async mutateResource<T>(
    resourcePolicy: RuntimeResourcePolicy,
    capability: string,
    executor: ResourceMutationExecutor<T>,
  ): Promise<T> {
    const state = this.stateStore.read();
    const decision = evaluateResourceMutation({ policy: resourcePolicy, capability });
    if (!decision.allowed) {
      this.blocked(state, decision.reason);
      throw new Error(`[LOOP_DENY] ${decision.reason}`);
    }

    if (!this.resourceLock) {
      this.blocked(state, `resource lock is required for mutation: ${resourcePolicy.resource}`);
      throw new Error('[LOOP_BLOCKED] resource lock is required for mutation');
    }

    this.resourceLock.acquire(resourcePolicy.resource, state.runId);
    try {
      this.resourceLock.assertOwned(resourcePolicy.resource, state.runId);
      return await executor.execute();
    } finally {
      this.resourceLock.release(resourcePolicy.resource, state.runId);
    }
  }

  /** 状态只能通过 Kernel 转移，禁止调用方直接写入 status。 */
  transition(to: string, guards: Record<string, boolean>): void {
    const state = this.stateStore.read();
    const currentRevision = this.policy.currentRevision();
    if (state.policyRevision !== currentRevision) {
      this.blocked(state, 'policy revision mismatch');
      throw new Error('[LOOP_BLOCKED] policy revision mismatch');
    }
    const context: TransitionGuardContext = { from: state.status, to, guards: { ...guards, policyRevisionMatch: true } };
    if (!enforceTransition(context)) {
      this.blocked(state, `transition ${state.status} -> ${to} failed its guards`);
      throw new Error(`[LOOP_BLOCKED] transition ${state.status} -> ${to} failed its guards`);
    }
    this.stateStore.write({ ...state, status: to });
    this.audit?.append({
      eventId: createRuntimeEventId('transition'),
      runId: state.runId,
      type: 'STATE_TRANSITION',
      at: new Date().toISOString(),
      policyRevision: state.policyRevision,
      payload: { from: state.status, to },
    });
  }

  private enforce(context: EnforcementContext): EnforcementResult {
    return enforceCapability(context);
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
