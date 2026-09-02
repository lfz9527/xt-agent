import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export type RunArtifactKind = 'plan' | 'spec' | 'evidence' | 'review';

export interface ArtifactRecord {
  runId: string;
  kind: RunArtifactKind;
  artifactId: string;
  path: string;
  sha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunArtifactStoreOptions {
  workspace?: string;
  now?: () => string;
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * P2-2 Run Artifact Runtime。
 * 所有业务产物都由 Run ID 隔离，并且只能落在项目 `.loop/` Workspace 内。
 */
export class RunArtifactStore {
  private readonly workspace: string;
  private readonly now: () => string;

  constructor(private readonly options: RunArtifactStoreOptions = {}) {
    this.workspace = resolve(options.workspace ?? '.loop');
    this.now = options.now ?? (() => new Date().toISOString());
  }

  writePlan(runId: string, content: string): ArtifactRecord {
    return this.writeText(runId, 'plan', runId, content, join('plans', `${runId}.md`));
  }

  writeSpec(runId: string, specId: string, content: string): ArtifactRecord {
    return this.writeText(runId, 'spec', specId, content, join('specs', runId, `${specId}.pecs.md`));
  }

  writeEvidence(runId: string, evidenceId: string, content: string): ArtifactRecord {
    return this.writeText(runId, 'evidence', evidenceId, content, join('evidence', runId, `${evidenceId}.yaml`));
  }

  writeReview(runId: string, content: string): ArtifactRecord {
    return this.writeText(runId, 'review', runId, content, join('reviews', `${runId}.md`));
  }

  hasPlan(runId: string): boolean {
    this.assertId(runId, 'runId');
    return existsSync(this.artifactAbsolutePath(join('plans', `${runId}.md`)));
  }

  read(runId: string, kind: RunArtifactKind, artifactId: string): string {
    this.assertId(runId, 'runId');
    this.assertId(artifactId, 'artifactId');
    return readFileSync(this.artifactAbsolutePath(this.relativeArtifactPath(runId, kind, artifactId)), 'utf8');
  }

  private writeText(runId: string, kind: RunArtifactKind, artifactId: string, content: string, relativePath: string): ArtifactRecord {
    this.assertId(runId, 'runId');
    this.assertId(artifactId, 'artifactId');
    if (typeof content !== 'string') throw new Error('[LOOP_BLOCKED] artifact content must be text');

    const absolutePath = this.artifactAbsolutePath(relativePath);
    const timestamp = this.now();
    const beforeExists = existsSync(absolutePath);
    const createdAt = beforeExists ? this.readRecordTimestamp(absolutePath, timestamp) : timestamp;
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    const tempPath = `${absolutePath}.tmp`;

    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'w' });
    renameSync(tempPath, absolutePath);

    return { runId, kind, artifactId, path: relative(this.workspace, absolutePath).replaceAll('\\', '/'), sha256, createdAt, updatedAt: timestamp };
  }

  private relativeArtifactPath(runId: string, kind: RunArtifactKind, artifactId: string): string {
    switch (kind) {
      case 'plan': return join('plans', `${runId}.md`);
      case 'spec': return join('specs', runId, `${artifactId}.pecs.md`);
      case 'evidence': return join('evidence', runId, `${artifactId}.yaml`);
      case 'review': return join('reviews', `${runId}.md`);
    }
  }

  private artifactAbsolutePath(relativePath: string): string {
    const target = resolve(this.workspace, relativePath);
    const workspacePrefix = `${this.workspace}${relative ? '/' : ''}`;
    const normalizedWorkspace = this.workspace.endsWith('/') ? this.workspace : `${this.workspace}/`;
    if (target !== this.workspace && !target.startsWith(normalizedWorkspace)) {
      throw new Error('[LOOP_BLOCKED] artifact path escapes .loop workspace');
    }
    void workspacePrefix;
    return target;
  }

  private assertId(value: string, name: string): void {
    if (!value || !SAFE_ID.test(value)) throw new Error(`[LOOP_BLOCKED] invalid ${name}`);
  }

  private readRecordTimestamp(path: string, fallback: string): string {
    // Artifact metadata is deliberately not embedded into user-authored content.
    // Existing files retain their creation timestamp only when a sidecar is introduced later.
    void path;
    return fallback;
  }
}
