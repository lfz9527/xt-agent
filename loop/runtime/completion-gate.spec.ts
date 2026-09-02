import { describe, expect, it } from 'vitest';
import { EvidenceCompletionGate, type CompletionEvidence } from './completion-gate';
import type { LoopRuntimeState } from './kernel';

function state(): LoopRuntimeState {
  return {
    runId: 'run-1', status: 'READY_FOR_CONFIRMATION', policyRevision: 1,
    snapshot: { runId: 'run-1', policyRevision: 1, trust: 'standard', permissions: {}, effectivePolicy: {}, resolvedAt: new Date().toISOString() },
    facts: {
      executionApprovalSatisfied: true, planArtifactExists: true, implementationCompleted: true,
      verificationPassed: true, verificationFailed: false, reviewPassed: true, reviewFailed: false,
      acceptancePassed: true, finalApprovalSatisfied: true, finalApprovalRejected: false,
      fixAttempts: 0, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: true, pauseExpired: false,
    },
  };
}

const evidence: CompletionEvidence = { id: 'verify-1', runId: 'run-1', criterion: 'acceptance', status: 'passed', confidence: 'high' };

describe('EvidenceCompletionGate', () => {
  it('allows DONE only when all completion facts and evidence are satisfied', () => {
    expect(new EvidenceCompletionGate().evaluate(state(), [evidence]).allowed).toBe(true);
  });

  it('rejects an empty evidence set', () => {
    expect(new EvidenceCompletionGate().evaluate(state(), []).allowed).toBe(false);
  });

  it('rejects evidence from another run', () => {
    expect(new EvidenceCompletionGate().evaluate(state(), [{ ...evidence, runId: 'run-2' }]).allowed).toBe(false);
  });

  it('rejects failed, skipped, or low-confidence evidence', () => {
    const gate = new EvidenceCompletionGate();
    expect(gate.evaluate(state(), [{ ...evidence, status: 'failed' }]).allowed).toBe(false);
    expect(gate.evaluate(state(), [{ ...evidence, status: 'skipped' }]).allowed).toBe(false);
    expect(gate.evaluate(state(), [{ ...evidence, confidence: 'low' }]).allowed).toBe(false);
  });

  it('rejects missing completion facts', () => {
    const current = state();
    current.facts.acceptancePassed = false;
    expect(new EvidenceCompletionGate().evaluate(current, [evidence]).allowed).toBe(false);
  });
});
