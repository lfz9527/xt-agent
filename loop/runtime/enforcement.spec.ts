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

  it('blocks confirm capabilities after rejection', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'git.push', capabilityDecision: 'confirm', approvalDecision: 'rejected' }).status).toBe('DENY');
  });

  it('accepts automatic approval for confirm capabilities', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'git.push', capabilityDecision: 'confirm', approvalDecision: 'automatic' }).status).toBe('ALLOW');
  });

  it('requires explicit confirmation policy for dangerous capabilities', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'shell.execute', capabilityDecision: 'allow', approvalDecision: 'automatic', dangerous: true }).status).toBe('DENY');
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'shell.execute', capabilityDecision: 'confirm', approvalDecision: 'required', dangerous: true }).status).toBe('CONFIRM');
  });

  it('blocks mismatched snapshot revision even when runtime revision matches', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 2, currentPolicyRevision: 2, snapshot, capability: 'filesystem.read', capabilityDecision: 'allow', approvalDecision: 'automatic' }).status).toBe('BLOCKED');
  });

  it('allows ordinary capabilities without approval', () => {
    expect(enforceCapability({ runId: 'run-1', policyRevision: 1, currentPolicyRevision: 1, snapshot, capability: 'filesystem.read', capabilityDecision: 'allow', approvalDecision: 'required' }).allowed).toBe(true);
  });

  it('blocks unknown transition sources and destinations', () => {
    expect(enforceTransition({ from: 'UNKNOWN', to: 'PLAN', facts })).toBe(false);
    expect(enforceTransition({ from: 'PLAN', to: 'UNKNOWN', facts })).toBe(false);
  });

  it('requires execution approval before entering PLAN', () => {
    expect(enforceTransition({ from: 'WAITING_FOR_GOAL_CONFIRMATION', to: 'PLAN', facts })).toBe(false);
    expect(enforceTransition({ from: 'WAITING_FOR_GOAL_CONFIRMATION', to: 'PLAN', facts: { ...facts, executionApprovalSatisfied: true } })).toBe(true);
  });

  it('requires plan and implementation facts at their respective boundaries', () => {
    expect(enforceTransition({ from: 'PLAN', to: 'IMPLEMENT', facts })).toBe(false);
    expect(enforceTransition({ from: 'PLAN', to: 'IMPLEMENT', facts: { ...facts, planArtifactExists: true } })).toBe(true);
    expect(enforceTransition({ from: 'IMPLEMENT', to: 'VERIFY', facts })).toBe(false);
    expect(enforceTransition({ from: 'IMPLEMENT', to: 'VERIFY', facts: { ...facts, implementationCompleted: true } })).toBe(true);
  });

  it('requires the correct outcome for verify and review branches', () => {
    expect(enforceTransition({ from: 'VERIFY', to: 'FIX', facts })).toBe(false);
    expect(enforceTransition({ from: 'VERIFY', to: 'FIX', facts: { ...facts, verificationFailed: true } })).toBe(true);
    expect(enforceTransition({ from: 'REVIEW', to: 'READY_FOR_CONFIRMATION', facts })).toBe(false);
    expect(enforceTransition({ from: 'REVIEW', to: 'READY_FOR_CONFIRMATION', facts: { ...facts, reviewPassed: true } })).toBe(true);
  });

  it('requires all completion facts before DONE', () => {
    const complete = { ...facts, acceptancePassed: true, verificationPassed: true, reviewPassed: true, finalApprovalSatisfied: true };
    expect(enforceTransition({ from: 'READY_FOR_CONFIRMATION', to: 'DONE', facts })).toBe(false);
    expect(enforceTransition({ from: 'READY_FOR_CONFIRMATION', to: 'DONE', facts: complete })).toBe(true);
    expect(enforceTransition({ from: 'READY_FOR_CONFIRMATION', to: 'DONE', facts: { ...complete, finalApprovalRejected: true } })).toBe(true);
  });

  it('requires a valid resume request and state', () => {
    expect(canResume('PAUSED', false, true)).toBe(false);
    expect(canResume('PAUSED', true, false)).toBe(false);
    expect(enforceTransition({ from: 'PAUSED', to: 'PLAN', facts })).toBe(false);
    expect(enforceTransition({ from: 'PAUSED', to: 'PLAN', facts: { ...facts, resumeRequested: true, resumeStateValid: true } })).toBe(true);
  });

  it('only allows PAUSED to become BLOCKED after pause expiry', () => {
    expect(enforceTransition({ from: 'PAUSED', to: 'BLOCKED', facts })).toBe(false);
    expect(enforceTransition({ from: 'PAUSED', to: 'BLOCKED', facts: { ...facts, pauseExpired: true } })).toBe(true);
  });
});
