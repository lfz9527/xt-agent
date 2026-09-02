import { FileCheckpointStore, type CheckpointStore } from './checkpoint';
import { RunArtifactStore } from './artifact-store';
import { FileStateStore, JsonlMutationJournal, JsonlRuntimeAuditLog, type MutationJournal, type RuntimeAuditLog } from './persistence';
import type { ProjectLoopWorkspace } from './project-workspace';

/**
 * Canonical persistence wiring for one project Loop workspace.
 * Every file-backed Runtime store created here shares the exact same `.loop` path.
 */
export class ProjectLoopRuntimeWorkspace {
  constructor(private readonly projectWorkspace: ProjectLoopWorkspace) {}

  get projectRoot(): string {
    return this.projectWorkspace.projectRoot;
  }

  get workspace(): string {
    return this.projectWorkspace.workspace;
  }

  stateStore(runId: string): FileStateStore {
    return new FileStateStore(this.workspace, runId);
  }

  stateStoreFactory(): (runId: string) => FileStateStore {
    return (runId) => this.stateStore(runId);
  }

  artifactStore(): RunArtifactStore {
    return new RunArtifactStore({ workspace: this.workspace });
  }

  auditLog(): RuntimeAuditLog {
    return new JsonlRuntimeAuditLog(this.workspace);
  }

  mutationJournal(runId: string): MutationJournal {
    return new JsonlMutationJournal(this.workspace, runId);
  }

  checkpointStore(): CheckpointStore {
    return new FileCheckpointStore(this.workspace);
  }
}
