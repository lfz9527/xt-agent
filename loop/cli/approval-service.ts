import type {
  HumanApprovalDecision,
  HumanApprovalGate,
  HumanApprovalGateName,
} from '../runtime/human-approval';
import type { LoopRuntimeState } from '../runtime/kernel';

export interface ApprovalServiceOptions {
  gate?: Pick<HumanApprovalGate, 'resolve'>;
}

/** CLI 只能通过 HumanApprovalGate Adapter 改变审批事实，不能直接写 Runtime State。 */
export class ApprovalService {
  constructor(private readonly options: ApprovalServiceOptions = {}) {}

  resolve(runId: string, gate: HumanApprovalGateName, decision: HumanApprovalDecision): LoopRuntimeState {
    if (!this.options.gate) {
      throw new Error('[LOOP_BLOCKED] HumanApprovalGate adapter is not configured');
    }
    return this.options.gate.resolve(runId, gate, decision);
  }

  approve(runId: string, gate: HumanApprovalGateName): LoopRuntimeState {
    return this.resolve(runId, gate, 'approved');
  }

  reject(runId: string, gate: HumanApprovalGateName): LoopRuntimeState {
    return this.resolve(runId, gate, 'rejected');
  }
}
