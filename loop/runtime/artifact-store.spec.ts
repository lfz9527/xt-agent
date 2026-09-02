import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunArtifactStore } from './artifact-store';

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'loop-artifacts-'));
  const store = new RunArtifactStore({ workspace, now: () => '2026-09-02T00:00:00.000Z' });
  return { workspace, store };
}

describe('RunArtifactStore', () => {
  it('writes a run-scoped plan under .loop/plans', () => {
    const { workspace, store } = fixture();
    const record = store.writePlan('run-1', '# Plan');

    expect(record.path).toBe('plans/run-1.md');
    expect(record.runId).toBe('run-1');
    expect(record.kind).toBe('plan');
    expect(record.sha256).toHaveLength(64);
    expect(readFileSync(join(workspace, 'plans', 'run-1.md'), 'utf8')).toBe('# Plan');
    expect(store.hasPlan('run-1')).toBe(true);
  });

  it('keeps specs, evidence and reviews isolated by run', () => {
    const { workspace, store } = fixture();
    store.writeSpec('run-a', 'spec-1', 'spec');
    store.writeEvidence('run-a', 'evidence-1', 'evidence');
    store.writeReview('run-a', 'review');

    expect(existsSync(join(workspace, 'specs', 'run-a', 'spec-1.pecs.md'))).toBe(true);
    expect(existsSync(join(workspace, 'evidence', 'run-a', 'evidence-1.yaml'))).toBe(true);
    expect(existsSync(join(workspace, 'reviews', 'run-a.md'))).toBe(true);
    expect(store.read('run-a', 'spec', 'spec-1')).toBe('spec');
    expect(store.read('run-a', 'evidence', 'evidence-1')).toBe('evidence');
    expect(store.read('run-a', 'review', 'run-a')).toBe('review');
  });

  it('rejects unsafe run and artifact identifiers', () => {
    const { store } = fixture();
    expect(() => store.writePlan('../escape', 'bad')).toThrow('[LOOP_BLOCKED] invalid runId');
    expect(() => store.writeSpec('run-1', '../escape', 'bad')).toThrow('[LOOP_BLOCKED] invalid artifactId');
    expect(() => store.read('run-1', 'evidence', 'a/b')).toThrow('[LOOP_BLOCKED] invalid artifactId');
  });

  it('uses atomic replacement when updating an existing artifact', () => {
    const { workspace, store } = fixture();
    const first = store.writePlan('run-1', 'first');
    const second = store.writePlan('run-1', 'second');

    expect(second.sha256).not.toBe(first.sha256);
    expect(readFileSync(join(workspace, 'plans', 'run-1.md'), 'utf8')).toBe('second');
    expect(existsSync(join(workspace, 'plans', 'run-1.md.tmp'))).toBe(false);
  });
});
