import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ProjectLoopWorkspaceInitializer } from './project-workspace';
import { ProjectLoopRuntimeWorkspace } from './project-runtime-workspace';

describe('ProjectLoopRuntimeWorkspace', () => {
  it('creates StateStore, ArtifactStore and AuditLog under the same project .loop', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'loop-runtime-workspace-'));

    try {
      const projectWorkspace = new ProjectLoopWorkspaceInitializer().ensure({ projectRoot });
      const runtimeWorkspace = new ProjectLoopRuntimeWorkspace(projectWorkspace);
      const runId = 'run-1';

      runtimeWorkspace.stateStore(runId).write({
        runId,
        status: 'INIT',
        policyRevision: 1,
        snapshot: {
          runId,
          policyRevision: 1,
          trust: 'standard',
          permissions: {},
          effectivePolicy: {},
          resolvedAt: new Date().toISOString(),
        },
        facts: {
          executionApprovalSatisfied: false,
          planArtifactExists: false,
          implementationCompleted: false,
          verificationPassed: false,
          verificationFailed: false,
          reviewPassed: false,
          reviewFailed: false,
          acceptancePassed: false,
          finalApprovalSatisfied: false,
          finalApprovalRejected: false,
          fixAttempts: 0,
          fixAttemptsWithinLimit: true,
          resumeRequested: false,
          resumeStateValid: false,
          pausedFromStatus: null,
          pauseExpired: false,
        },
      });
      const artifact = runtimeWorkspace.artifactStore().writePlan(runId, '# Plan');
      runtimeWorkspace.auditLog().append({
        eventId: 'evt-1',
        runId,
        type: 'STAGE',
        at: new Date().toISOString(),
        policyRevision: 1,
        payload: { stage: 'PLAN' },
      });

      expect(artifact.path).toBe(`plans/${runId}.md`);
      expect(existsSync(join(projectRoot, '.loop', 'runtime', 'runs', runId, 'state.yaml'))).toBe(true);
      expect(readFileSync(join(projectRoot, '.loop', 'runtime', 'history.jsonl'), 'utf8')).toContain('evt-1');
      expect(existsSync(join(projectRoot, '.loop', 'plans', `${runId}.md`))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
