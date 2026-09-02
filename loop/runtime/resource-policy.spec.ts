import { describe, expect, it } from 'vitest';
import { evaluateResourceMutation, DEFAULT_RESOURCE_POLICIES } from './resource-policy';

describe('resource policy', () => {
  it('allows a declared capability to mutate a mutable resource', () => {
    expect(evaluateResourceMutation({
      policy: DEFAULT_RESOURCE_POLICIES[0],
      capability: 'code.modify',
    }).allowed).toBe(true);
  });

  it('denies an undeclared capability on a mutable resource', () => {
    expect(evaluateResourceMutation({
      policy: DEFAULT_RESOURCE_POLICIES[0],
      capability: 'shell.execute',
    }).allowed).toBe(false);
  });

  it('denies readonly resources even if a capability is supplied', () => {
    expect(evaluateResourceMutation({
      policy: { resource: '.git', kind: 'readonly', allowedCapabilities: ['git.modify'] },
      capability: 'git.modify',
    }).allowed).toBe(false);
  });

  it('allows only explicitly privileged capabilities on protected resources', () => {
    const policy = DEFAULT_RESOURCE_POLICIES.find((item) => item.resource === '.loop/config.yaml')!;
    expect(evaluateResourceMutation({ policy, capability: 'code.modify' }).allowed).toBe(false);
    expect(evaluateResourceMutation({ policy, capability: 'loop.policy.modify' }).allowed).toBe(true);
  });
});
