import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FileStateStore, JsonlRuntimeAuditLog } from './persistence';

const workspace = join(process.cwd(), '.loop-runtime-test');
const snapshot = {
  runId: 'run-1',
  policyRevision: 3,
  trust: 'high',
  permissions: {},
  effectivePolicy: {},
  resolvedAt: new Date(0).toISOString(),
};

const state = { runId: 'run-1', status: 'PLAN', policyRevision: 3, snapshot };

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe('FileStateStore', () => {
  it('writes and reads a schema-versioned state atomically', () => {
    const store = new FileStateStore(workspace);
    store.write(state);
    expect(store.read()).toEqual(state);
    expect(existsSync(join(workspace, 'runtime', 'state.yaml'))).toBe(true);
    expect(existsSync(join(workspace, 'runtime', 'state.yaml.tmp'))).toBe(false);
  });

  it('recovers a completed temp state when the main file is missing', () => {
    const runtime = join(workspace, 'runtime');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'state.yaml.tmp'), JSON.stringify({ ...state, schemaVersion: 1 }));
    expect(new FileStateStore(workspace).read()).toEqual(state);
    expect(existsSync(join(runtime, 'state.yaml'))).toBe(true);
  });

  it('blocks malformed, stale, or schema-incompatible state', () => {
    const runtime = join(workspace, 'runtime');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'state.yaml'), JSON.stringify({ ...state, schemaVersion: 99 }));
    expect(() => new FileStateStore(workspace).read()).toThrow('schema version');
  });
});

describe('JsonlRuntimeAuditLog', () => {
  it('appends immutable audit events without rewriting prior entries', () => {
    const log = new JsonlRuntimeAuditLog(workspace);
    log.append({ eventId: 'evt-1', runId: 'run-1', type: 'STATE_TRANSITION', at: '2026-09-02T00:00:00.000Z', policyRevision: 3, payload: { to: 'PLAN' } });
    log.append({ eventId: 'evt-2', runId: 'run-1', type: 'APPROVAL_RESOLVED', at: '2026-09-02T00:00:01.000Z', policyRevision: 3, payload: { decision: 'approved' } });
    const lines = require('node:fs').readFileSync(join(workspace, 'runtime', 'history.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).eventId).toBe('evt-1');
    expect(JSON.parse(lines[1]).eventId).toBe('evt-2');
  });
});
