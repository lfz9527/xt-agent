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

const DEFAULT_PROJECT_CONFIG = `# Project-level Loop configuration.\n# This file belongs to the project and is created automatically on first /loop run.\nversion: 1\ntrust: low\npolicyRevision: 1\n\npermissions:\n  approval:\n    beforeExecution: inherit\n    beforeFinalize: inherit\n  filesystem:\n    read: allow\n    write: allow\n  shell:\n    execute: allow\n    dangerous: confirm\n  git:\n    read: allow\n    commit: confirm\n    push: confirm\n  network:\n    request: confirm\n`;

const DEFAULT_README = `# Loop Project Workspace\n\nThis directory is the project-local workspace for Loop.\n\n## Structure\n\n- \\`config.yaml\\`: project-level Trust, permissions and policy revision.\n- \\`runtime/\\`: Run state, locks and append-only audit history.\n- \\`plans/\\`: generated Plan artifacts.\n- \\`specs/\\`: generated PECS specification artifacts.\n- \\`evidence/\\`: verification Evidence.\n- \\`reviews/\\`: Review artifacts.\n\nLoop creates and restores this workspace automatically. Existing files are never overwritten during initialization.\n`;

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
