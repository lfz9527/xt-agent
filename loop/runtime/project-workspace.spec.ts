import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectLoopWorkspaceInitializer } from './project-workspace';

describe('ProjectLoopWorkspaceInitializer', () => {
  it('creates the complete project .loop workspace on first run', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'loop-project-'));

    try {
      const result = new ProjectLoopWorkspaceInitializer().ensure({ projectRoot });

      expect(result.created).toBe(true);
      expect(readFileSync(join(projectRoot, '.loop', 'README.md'), 'utf8')).toContain('Loop Project Workspace');
      expect(readFileSync(join(projectRoot, '.loop', 'config.yaml'), 'utf8')).toContain('policyRevision: 1');
      expect(readFileSync(join(projectRoot, '.loop', 'runtime', 'history.jsonl'), 'utf8')).toBe('');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('is idempotent and preserves existing project configuration', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'loop-project-'));

    try {
      const initializer = new ProjectLoopWorkspaceInitializer();
      initializer.ensure({ projectRoot });
      const configPath = join(projectRoot, '.loop', 'config.yaml');
      const original = readFileSync(configPath, 'utf8');

      const result = initializer.ensure({ projectRoot });

      expect(result.created).toBe(false);
      expect(readFileSync(configPath, 'utf8')).toBe(original);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
