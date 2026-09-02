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

/** Guard 只能消费 Runtime Facts，禁止依赖未持久化的隐式状态。 */
export interface RuntimeFacts {
  executionApprovalSatisfied: boolean;
  planArtifactExists: boolean;
  implementationCompleted: boolean;
  verificationPassed: boolean;
  verificationFailed: boolean;
  reviewPassed: boolean;
  reviewFailed: boolean;
  acceptancePassed: boolean;
  finalApprovalSatisfied: boolean;
  finalApprovalRejected: boolean;
  fixAttemptsWithinLimit: boolean;
  resumeRequested: boolean;
  resumeStateValid: boolean;
  pauseExpired: boolean;
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

export function enforceCapability(context: EnforcementContext): EnforcementResult {
  if (context.snapshot.runId !== context.runId) return { allowed: false, status: 'BLOCKED', reason: 'policy snapshot belongs to another run' };
  if (context.currentPolicyRevision !== context.policyRevision || context.snapshot.policyRevision !== context.policyRevision) return { allowed: false, status: 'BLOCKED', reason: 'policy revision mismatch; execution must be blocked' };
  if (context.capabilityDecision === 'deny') return { allowed: false, status: 'DENY', reason: 'capability permission denied by policy' };
  if (context.dangerous && context.capabilityDecision !== 'confirm') return { allowed: false, status: 'DENY', reason: 'dangerous capability requires an explicit confirmation policy' };
  if (context.capabilityDecision === 'confirm') {
    if (context.approvalDecision === 'approved' || context.approvalDecision === 'automatic') return { allowed: true, status: 'ALLOW', reason: 'required approval has been satisfied' };
    if (context.approvalDecision === 'rejected') return { allowed: false, status: 'DENY', reason: 'required approval was rejected' };
    return { allowed: false, status: 'CONFIRM', reason: 'explicit approval is required before capability execution' };
  }
  return { allowed: true, status: 'ALLOW', reason: 'capability is allowed by policy' };
}

export interface TransitionGuardContext {
  from: string;
  to: string;
  facts: RuntimeFacts;
  guards?: Record<string, boolean>;
}

const ALLOWED_NEXT: Record<string, string[]> = {
  INIT: ['GOAL_REVIEW', 'BLOCKED'], GOAL_REVIEW: ['WAITING_FOR_GOAL_CONFIRMATION', 'BLOCKED'],
  WAITING_FOR_GOAL_CONFIRMATION: ['PLAN', 'BLOCKED', 'PAUSED'], PLAN: ['IMPLEMENT', 'BLOCKED', 'PAUSED'],
  IMPLEMENT: ['VERIFY', 'BLOCKED', 'PAUSED'], VERIFY: ['REVIEW', 'FIX', 'BLOCKED', 'PAUSED'],
  REVIEW: ['READY_FOR_CONFIRMATION', 'FIX', 'BLOCKED', 'PAUSED'], READY_FOR_CONFIRMATION: ['DONE', 'FIX', 'BLOCKED', 'PAUSED'],
  FIX: ['IMPLEMENT', 'BLOCKED', 'PAUSED'], PAUSED: ['WAITING_FOR_GOAL_CONFIRMATION', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'READY_FOR_CONFIRMATION', 'FIX', 'BLOCKED'],
  DONE: [], BLOCKED: [],
};

const REQUIRED_GUARDS: Record<string, (facts: RuntimeFacts) => boolean> = {
  'WAITING_FOR_GOAL_CONFIRMATION->PLAN': (f) => f.executionApprovalSatisfied,
  'PLAN->IMPLEMENT': (f) => f.planArtifactExists,
  'IMPLEMENT->VERIFY': (f) => f.implementationCompleted,
  'VERIFY->REVIEW': (f) => f.verificationPassed,
  'VERIFY->FIX': (f) => f.verificationFailed,
  'REVIEW->READY_FOR_CONFIRMATION': (f) => f.reviewPassed,
  'REVIEW->FIX': (f) => f.reviewFailed,
  'READY_FOR_CONFIRMATION->DONE': (f) => f.acceptancePassed && f.verificationPassed && f.reviewPassed && f.finalApprovalSatisfied,
  'READY_FOR_CONFIRMATION->FIX': (f) => f.finalApprovalRejected,
  'FIX->IMPLEMENT': (f) => f.fixAttemptsWithinLimit,
  'PAUSED->WAITING_FOR_GOAL_CONFIRMATION': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->PLAN': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->IMPLEMENT': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->VERIFY': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->REVIEW': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->READY_FOR_CONFIRMATION': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->FIX': (f) => f.resumeRequested && f.resumeStateValid,
  'PAUSED->BLOCKED': (f) => f.pauseExpired,
};

export function enforceTransition(context: TransitionGuardContext): boolean {
  if (context.guards?.policyRevisionMatch === false) return false;
  if (!ALLOWED_NEXT[context.from]?.includes(context.to)) return false;
  const required = REQUIRED_GUARDS[`${context.from}->${context.to}`];
  return required ? required(context.facts) : true;
}

export function validatePolicyRevision(previousRevision: number, nextRevision: number): boolean {
  return Number.isInteger(previousRevision) && previousRevision >= 1 && Number.isInteger(nextRevision) && nextRevision > previousRevision;
}

export function canResume(status: string, resumeRequested: boolean, stateValid: boolean): boolean {
  return status === 'PAUSED' && resumeRequested && stateValid;
}
