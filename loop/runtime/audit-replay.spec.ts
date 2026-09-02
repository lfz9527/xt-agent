import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RuntimeAuditReplay } from './audit-replay';

function event(type: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return { eventId: `evt-${Math.random()}`, runId: 'run-1', type, at: new Date().toISOString(), policyRevision: 1, payload, ...overrides };
}

describe('RuntimeAuditReplay', () => {
  const workspace = join(process.cwd(), '.tmp-audit-replay');

  it('reconstructs a run transition timeline without executing it', () => {
    mkdirSync(join(workspace, 'runtime'), { recursive: true });
    writeFileSync(join(workspace, 'runtime', 'history.jsonl'), [
      event('STATE_TRANSITION', { from: 'INIT', to: 'PLAN' }),
      event('APPROVAL_RESOLVED', { capability: 'write', decision: 'approved' }),
      event('STATE_TRANSITION', { from: 'PLAN', to: 'IMPLEMENT' }),
      event('STATE_TRANSITION', { from: 'IMPLEMENT', to: 'DONE' }),
      event('STATE_TRANSITION', { from: 'INIT', to: 'PLAN' }, { runId: 'other-run' }),
    ].map((item) => JSON.stringify(item)).join('\n'));

    const result = new RuntimeAuditReplay(workspace).replay('run-1');
    expect(result.events).toHaveLength(4);
    expect(result.transitions.map((item) => `${item.from}->${item.to}`)).toEqual([
      'INIT->PLAN', 'PLAN->IMPLEMENT', 'IMPLEMENT->DONE',
    ]);
    expect(result.finalStatus).toBe('DONE');
    expect(result.policyRevisions).toEqual([1]);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('rejects a broken transition chain', () => {
    mkdirSync(join(workspace, 'runtime'), { recursive: true });
    writeFileSync(join(workspace, 'runtime', 'history.jsonl'), [
      event('STATE_TRANSITION', { from: 'INIT', to: 'PLAN' }),
      event('STATE_TRANSITION', { from: 'VERIFY', to: 'DONE' }),
    ].map((item) => JSON.stringify(item)).join('\n'));

    expect(() => new RuntimeAuditReplay(workspace).replay('run-1')).toThrow('[LOOP_BLOCKED] audit transition chain is inconsistent');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('rejects malformed audit records instead of silently replaying them', () => {
    mkdirSync(join(workspace, 'runtime'), { recursive: true });
    writeFileSync(join(workspace, 'runtime', 'history.jsonl'), '{bad-json}\n');

    expect(() => new RuntimeAuditReplay(workspace).read('run-1')).toThrow('[LOOP_BLOCKED] audit history contains invalid JSON');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns an empty replay when no history exists', () => {
    rmSync(workspace, { recursive: true, force: true });
    expect(new RuntimeAuditReplay(workspace).replay('run-1')).toEqual({
      runId: 'run-1', events: [], transitions: [], finalStatus: undefined, policyRevisions: [],
    });
  });
});
