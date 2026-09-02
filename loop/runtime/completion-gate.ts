import type { LoopRuntimeState } from './kernel';

export type EvidenceStatus = 'passed' | 'failed' | 'skipped';
export type EvidenceConfidence = 'high' | 'medium' | 'low';

export interface CompletionEvidence {
  id: string;
  runId: string;
  criterion: string;
  status: EvidenceStatus;
  confidence: EvidenceConfidence;
}

export interface CompletionDecision {
  allowed: boolean;
  reason: string;
}

/** P2-4：DONE 只能由可验证 Evidence 驱动，Agent 的完成声明本身不构成证明。 */
export class EvidenceCompletionGate {
  evaluate(state: LoopRuntimeState, evidence: CompletionEvidence[]): CompletionDecision {
    if (state.status !== 'READY_FOR_CONFIRMATION') return { allowed: false, reason: 'completion gate requires READY_FOR_CONFIRMATION' };
    if (!state.facts.acceptancePassed) return { allowed: false, reason: 'acceptance criteria have not passed' };
    if (!state.facts.verificationPassed) return { allowed: false, reason: 'verification has not passed' };
    if (!state.facts.reviewPassed) return { allowed: false, reason: 'review has not passed' };
    if (!state.facts.finalApprovalSatisfied || state.facts.finalApprovalRejected) return { allowed: false, reason: 'final approval is not satisfied' };
    if (evidence.length === 0) return { allowed: false, reason: 'completion evidence is required' };
    const invalid = evidence.find((item) => item.runId !== state.runId || !item.id.trim() || !item.criterion.trim() || item.status !== 'passed' || item.confidence === 'low');
    if (invalid) return { allowed: false, reason: 'completion evidence is invalid, failed, skipped, low-confidence, or belongs to another run' };
    return { allowed: true, reason: 'acceptance, verification, review, final approval, and evidence are satisfied' };
  }
}
