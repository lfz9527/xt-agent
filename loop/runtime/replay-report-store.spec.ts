import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReplayReport } from './replay-report';
import { RuntimeReplayReportStore } from './replay-report-store';

const report: ReplayReport = {
  runId: 'run-1',
  finalStatus: 'READY_FOR_CONFIRMATION',
  policyRevisions: [1, 2],
  entries: [],
  counts: {} as ReplayReport['counts'],
};

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe('RuntimeReplayReportStore', () => {
  it('writes the P2-5 replay report under the Run directory', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'loop-replay-report-'));
    workspaces.push(workspace);
    const store = new RuntimeReplayReportStore(workspace);

    const path = store.write(report);

    expect(path).toBe(join(workspace, 'runtime', 'runs', 'run-1', 'replay-report.json'));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
    expect(store.read('run-1')).toEqual(report);
  });

  it('returns undefined when the Run report does not exist', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'loop-replay-report-'));
    workspaces.push(workspace);
    expect(new RuntimeReplayReportStore(workspace).read('missing')).toBeUndefined();
  });

  it('blocks unsafe Run IDs', () => {
    const store = new RuntimeReplayReportStore('.loop');
    expect(() => store.path('../escape')).toThrow('[LOOP_BLOCKED]');
    expect(() => store.path('run/1')).toThrow('[LOOP_BLOCKED]');
  });

  it('blocks malformed persisted reports', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'loop-replay-report-'));
    workspaces.push(workspace);
    const store = new RuntimeReplayReportStore(workspace);
    const path = store.write(report);
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(path, '{broken', 'utf8');

    expect(() => store.read('run-1')).toThrow('[LOOP_BLOCKED] replay report is invalid');
  });
});
