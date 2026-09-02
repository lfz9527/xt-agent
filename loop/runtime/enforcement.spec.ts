import { describe, expect, it } from 'vitest';
import { canResume, enforceCapability, enforceTransition, validatePolicyRevision, type RuntimeFacts } from './enforcement';

const snapshot = { runId: 'run-1', policyRevision: 1, trust: 'low', permissions: {}, effectivePolicy: {}, resolvedAt: new Date(0).toISOString() };
const facts: RuntimeFacts = {
  executionApprovalSatisfied: false, planArtifactExists: false, implementationCompleted: false, verificationPassed: false,
  verificationFailed: false, reviewPassed: false, reviewFailed: false, acceptancePassed: false, finalApprovalSatisfied: false,
  finalApprovalRejected: false, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: false, pauseExpired: false,
};

describe('runtime enforcement', () => {
  it('blocks stale or cross-run policy snapshots', () => {
    expect(enforceCapability({ runId: 'run-2', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'shell.execute', capabilityDecision: 'allow', approvalDecision: 'automatic' }).status).toBe('BLOCKED');
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 2, snapshot, capability: 'shell.execute', capabilityDecision: 'allow', approvalDecision: 'automatic' }).status).toBe('BLOCKED');
  });

  it('keeps deny stronger than approval', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'filesystem.write', capabilityDecision: 'deny', approvalDecision: 'approved' }).status).toBe('DENY');
  });

  it('requires approval for confirm', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'git.push', capabilityDecision: 'confirm', approvalDecision: 'required' }).status).toBe('CONFIRM');
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'git.push', capabilityDecision: 'confirm', approvalDecision: 'approved' }).allowed).toBe(true);
  });

  it('requires transition guards and valid topology', () => {
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', facts })).toBe(false);
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', facts: { ...facts, verificationPassed: true } })).toBe(true);
    expect(enforceTransition({ from: 'VERIFY', to: 'PLAN', facts })).toBe(false);
    expect(enforceTransition({ from: 'PAUSED', to: 'INIT', facts: { ...facts, resumeRequested: true, resumeStateValid: true } })).toBe(false);
  });

  it('ignores caller-supplied guard values and evaluates persisted facts', () => {
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', facts, guards: { verificationPassed: true } })).toBe(false);
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', facts: { ...facts, verificationPassed: true }, guards: { verificationPassed: false } })).toBe(true);
  });

  it('requires monotonically increasing policy revisions', () => {
    expect(validatePolicyRevision(1, 2)).toBe(true);
    expect(validatePolicyRevision(2, 2)).toBe(false);
    expect(validatePolicyRevision(2, 1)).toBe(false);
  });

  it('never resumes BLOCKED in place', () => {
    expect(canResume('BLOCKED', true, true)).toBe(false);
    expect(canResume('PAUSED', true, true)).toBe(true);
  });
});
