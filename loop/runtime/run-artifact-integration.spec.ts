import { describe, expect, it, vi } from 'vitest';
import { RunRuntime } from './run-runtime';
import { RunArtifactStore } from './artifact-store';
import type { LoopRuntimeState, StateStore } from './kernel';
import type { PolicySnapshot } from './enforcement';

const snapshot = (runId: string): PolicySnapshot => ({
  runId,
  policyRevision: 1,
  trust: 'standard',
  permissions: {},
  effectivePolicy: {},
  resolvedAt: new Date(0).toISOString(),
});

describe('RunRuntime + Artifact Runtime', () => {
  it('persists plan existence as a runtime fact after writing the plan artifact', () => {
    let current: LoopRuntimeState | undefined;
    const store: StateStore = {
      read: () => current!,
      write: (next) => { current = next; },
    };
    const policy = {
      currentRevision: vi.fn(() => 1),
      createSnapshot: vi.fn((runId: string) => snapshot(runId)),
    };
    const workspace = `/tmp/loop-p2-2-${Date.now()}`;
    const runtime = new RunRuntime(() => store, policy, {
      createRunId: () => 'run-1',
      artifactStore: new RunArtifactStore({ workspace }),
    });

    runtime.createRun();
    const next = runtime.writePlan('run-1', '# Plan');

    expect(next.facts.planArtifactExists).toBe(true);
    expect(current?.facts.planArtifactExists).toBe(true);
  });
});
