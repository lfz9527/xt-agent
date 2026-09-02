import { describe, expect, it } from 'vitest';
import { canResume, enforceCapability, enforceTransition, validatePolicyRevision } from './enforcement';

const snapshot = { runId: 'run-1', policyRevision: 1, trust: 'low', permissions: {}, effectivePolicy: {}, resolvedAt: new Date(0).toISOString() };

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
  it('requires transition guards', () => {
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', guards: { verificationPassed: false } })).toBe(false);
    expect(enforceTransition({ from: 'VERIFY', to: 'REVIEW', guards: { verificationPassed: true } })).toBe(true);
    expect(enforceTransition({ from: 'PAUSED', to: 'INIT', guards: { resumeRequested: true, resumeStateValid: true } })).toBe(true);
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
