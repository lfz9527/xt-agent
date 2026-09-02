export type CapabilityDecision = 'deny' | 'allow' | 'confirm';
export type ApprovalDecision = 'required' | 'automatic' | 'approved' | 'rejected';

export interface PolicySnapshot {
  runId: string;
  policyRevision: number;
  trust: string;
  permissions: Record<string, string>;
  effectivePolicy: Record<string, unknown>;
  resolvedAt: string;
}

export interface EnforcementContext {
  runId: string;
  policyRevision: number;
  currentPolicyRevision: number;
  snapshot: PolicySnapshot;
  capability: string;
  capabilityDecision: CapabilityDecision;
  approvalDecision: ApprovalDecision;
  dangerous?: boolean;
}

export interface EnforcementResult {
  allowed: boolean;
  status: 'ALLOW' | 'CONFIRM' | 'DENY' | 'BLOCKED';
  reason: string;
}

/** Runtime Enforcement 是 Capability 执行前的最终安全边界。 */
export function enforceCapability(context: EnforcementContext): EnforcementResult {
  if (context.snapshot.runId !== context.runId) {
    return { allowed: false, status: 'BLOCKED', reason: 'policy snapshot belongs to another run' };
  }
  if (context.currentPolicyRevision !== context.policyRevision || context.snapshot.policyRevision !== context.policyRevision) {
    return { allowed: false, status: 'BLOCKED', reason: 'policy revision mismatch; execution must be blocked' };
  }
  if (context.capabilityDecision === 'deny') {
    return { allowed: false, status: 'DENY', reason: 'capability permission denied by policy' };
  }
  if (context.dangerous && context.capabilityDecision !== 'confirm') {
    return { allowed: false, status: 'DENY', reason: 'dangerous capability requires an explicit confirmation policy' };
  }
  if (context.capabilityDecision === 'confirm') {
    if (context.approvalDecision === 'approved' || context.approvalDecision === 'automatic') {
      return { allowed: true, status: 'ALLOW', reason: 'required approval has been satisfied' };
    }
    if (context.approvalDecision === 'rejected') {
      return { allowed: false, status: 'DENY', reason: 'required approval was rejected' };
    }
    return { allowed: false, status: 'CONFIRM', reason: 'explicit approval is required before capability execution' };
  }
  return { allowed: true, status: 'ALLOW', reason: 'capability is allowed by policy' };
}

export interface TransitionGuardContext {
  from: string;
  to: string;
  guards: Record<string, boolean>;
}

const REQUIRED_GUARDS: Record<string, string[]> = {
  'WAITING_FOR_GOAL_CONFIRMATION->PLAN': ['executionApprovalSatisfied'],
  'PLAN->IMPLEMENT': ['planArtifactExists'],
  'IMPLEMENT->VERIFY': ['implementationCompleted'],
  'VERIFY->REVIEW': ['verificationPassed'],
  'VERIFY->FIX': ['verificationFailed'],
  'REVIEW->READY_FOR_CONFIRMATION': ['reviewPassed'],
  'REVIEW->FIX': ['reviewFailed'],
  'READY_FOR_CONFIRMATION->DONE': ['acceptancePassed', 'verificationPassed', 'reviewPassed', 'finalApprovalSatisfied'],
  'READY_FOR_CONFIRMATION->FIX': ['finalApprovalRejected'],
  'FIX->IMPLEMENT': ['fixAttemptsWithinLimit'],
  'PAUSED->INIT': ['resumeRequested', 'resumeStateValid'],
};

/** State transition 不得通过直接修改 status 绕过 Gate。 */
export function enforceTransition(context: TransitionGuardContext): boolean {
  if (context.guards.policyRevisionMatch === false) return false;
  const required = REQUIRED_GUARDS[`${context.from}->${context.to}`] ?? [];
  return required.every((guard) => context.guards[guard] === true);
}

/** Policy Revision 必须是正整数；策略更新必须生成更高 Revision。 */
export function validatePolicyRevision(previousRevision: number, nextRevision: number): boolean {
  return Number.isInteger(previousRevision) && previousRevision >= 1 && Number.isInteger(nextRevision) && nextRevision > previousRevision;
}

/** Resume 只能从 PAUSED 恢复；BLOCKED 永远不能原地恢复。 */
export function canResume(status: string, resumeRequested: boolean, stateValid: boolean): boolean {
  return status === 'PAUSED' && resumeRequested && stateValid;
}
