import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ProjectLoopWorkspace {
  projectRoot: string;
  workspace: string;
  created: boolean;
}

export interface ProjectLoopWorkspaceOptions {
  projectRoot?: string;
  cwd?: string;
}

const DEFAULT_PROJECT_CONFIG = `# Project-level Loop configuration.
# This file belongs to the project and is created automatically on first /loop run.
version: 1
trust: low
policyRevision: 1

permissions:
  approval:
    beforeExecution: inherit
    beforeFinalize: inherit
  filesystem:
    read: allow
    write: allow
  shell:
    execute: allow
    dangerous: confirm
  git:
    read: allow
    commit: confirm
    push: confirm
  network:
    request: confirm
`;

const DEFAULT_README = `# Loop Project Workspace

This directory is the project-local workspace for Loop.

## Structure

- config.yaml: project-level Trust, permissions and policy revision.
- runtime/: Run state, locks and append-only audit history.
- plans/: generated Plan artifacts.
- specs/: generated PECS specification artifacts.
- evidence/: verification Evidence.
- reviews/: Review artifacts.

Loop creates and restores this workspace automatically. Existing files are never overwritten during initialization.
`;

const DIRECTORIES = [
  'runtime/runs',
  'runtime/locks',
  'plans',
  'specs',
  'evidence',
  'reviews',
];

/**
 * Project-level Loop workspace initializer.
 * It is idempotent and never overwrites existing project configuration or artifacts.
 */
export class ProjectLoopWorkspaceInitializer {
  ensure(options: ProjectLoopWorkspaceOptions = {}): ProjectLoopWorkspace {
    const projectRoot = this.resolveProjectRoot(options);
    const workspace = resolve(projectRoot, '.loop');
    const wasMissing = !existsSync(workspace);

    mkdirSync(workspace, { recursive: true });
    for (const directory of DIRECTORIES) {
      mkdirSync(join(workspace, directory), { recursive: true });
    }

    this.createIfMissing(join(workspace, 'README.md'), DEFAULT_README);
    this.createIfMissing(join(workspace, 'config.yaml'), DEFAULT_PROJECT_CONFIG);
    this.createIfMissing(join(workspace, 'runtime', 'history.jsonl'), '');

    return { projectRoot, workspace, created: wasMissing };
  }

  private resolveProjectRoot(options: ProjectLoopWorkspaceOptions): string {
    if (options.projectRoot) return resolve(options.projectRoot);

    const cwd = resolve(options.cwd ?? process.cwd());
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || cwd;
    } catch {
      return cwd;
    }
  }

  private createIfMissing(path: string, content: string): void {
    if (!existsSync(path)) writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
  }
}
