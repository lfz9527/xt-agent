import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FileStateStore, JsonlRuntimeAuditLog, JsonlMutationJournal } from './persistence';
import type { RuntimeFacts } from './enforcement';

const workspace = join(process.cwd(), '.loop-runtime-test');
const snapshot = { runId: 'run-1', policyRevision: 3, trust: 'high', permissions: {}, effectivePolicy: {}, resolvedAt: new Date(0).toISOString() };
const facts: RuntimeFacts = {
  executionApprovalSatisfied: false, planArtifactExists: false, implementationCompleted: false, verificationPassed: false,
  verificationFailed: false, reviewPassed: false, reviewFailed: false, acceptancePassed: false, finalApprovalSatisfied: false,
  finalApprovalRejected: false, fixAttemptsWithinLimit: true, resumeRequested: false, resumeStateValid: false, pauseExpired: false,
};
const state = { runId: 'run-1', status: 'PLAN', policyRevision: 3, snapshot, facts };

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe('FileStateStore', () => {
  it('writes each run state into its own directory', () => {
    const store = new FileStateStore(workspace, 'run-1');
    store.write(state);
    expect(store.read()).toEqual(state);
    expect(existsSync(join(workspace, 'runtime', 'runs', 'run-1', 'state.yaml'))).toBe(true);
    expect(existsSync(join(workspace, 'runtime', 'runs', 'run-1', 'state.yaml.tmp'))).toBe(false);
  });

  it('keeps two run states independent', () => {
    const run1 = new FileStateStore(workspace, 'run-1');
    const run2 = new FileStateStore(workspace, 'run-2');
    run1.write(state);
    run2.write({ ...state, runId: 'run-2', snapshot: { ...snapshot, runId: 'run-2' } });
    expect(run1.read().runId).toBe('run-1');
    expect(run2.read().runId).toBe('run-2');
  });

  it('recovers a completed temp state when the main file is missing', () => {
    const runtime = join(workspace, 'runtime', 'runs', 'run-1');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'state.yaml.tmp'), JSON.stringify({ ...state, schemaVersion: 1 }));
    expect(new FileStateStore(workspace, 'run-1').read()).toEqual(state);
    expect(existsSync(join(runtime, 'state.yaml'))).toBe(true);
  });

  it('blocks state belonging to another run', () => {
    const runtime = join(workspace, 'runtime', 'runs', 'run-1');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'state.yaml'), JSON.stringify({ ...state, schemaVersion: 1 }));
    expect(() => new FileStateStore(workspace, 'run-2').read()).toThrow('requested run');
  });

  it('blocks malformed or schema-incompatible state', () => {
    const runtime = join(workspace, 'runtime', 'runs', 'run-1');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'state.yaml'), JSON.stringify({ ...state, schemaVersion: 99 }));
    expect(() => new FileStateStore(workspace, 'run-1').read()).toThrow('schema version');
  });
});

describe('JsonlRuntimeAuditLog', () => {
  it('appends immutable audit events for multiple runs', () => {
    const log = new JsonlRuntimeAuditLog(workspace);
    log.append({ eventId: 'evt-1', runId: 'run-1', type: 'STATE_TRANSITION', at: '2026-09-02T00:00:00.000Z', policyRevision: 3, payload: { to: 'PLAN' } });
    log.append({ eventId: 'evt-2', runId: 'run-2', type: 'APPROVAL_RESOLVED', at: '2026-09-02T00:00:01.000Z', policyRevision: 3, payload: { decision: 'approved' } });
    const lines = readFileSync(join(workspace, 'runtime', 'history.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('JsonlMutationJournal', () => {
  it('records before/after worktree fingerprints', () => {
    const journal = new JsonlMutationJournal(workspace);
    journal.append({ mutationId: 'mutation-1', runId: 'run-1', resource: 'src/a.ts', capability: 'code.modify', at: '2026-09-02T00:00:00.000Z', beforeWorktreeFingerprint: '', afterWorktreeFingerprint: ' M src/a.ts', result: 'committed' });
    const line = readFileSync(join(workspace, 'runtime', 'mutation-journal.jsonl'), 'utf8').trim();
    expect(JSON.parse(line).afterWorktreeFingerprint).toBe(' M src/a.ts');
  });
});
