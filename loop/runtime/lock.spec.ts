import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RuntimeResourceLock } from './lock';

const workspace = join(process.cwd(), '.loop-lock-test');

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe('RuntimeResourceLock', () => {
  it('allows a run to acquire and release a resource lock', () => {
    const lock = new RuntimeResourceLock(workspace);
    lock.acquire('working-tree', 'run-1');
    expect(lock.isOwned('working-tree', 'run-1')).toBe(true);
    expect(existsSync(join(workspace, 'runtime', 'locks', 'working-tree.lock'))).toBe(true);
    lock.release('working-tree', 'run-1');
    expect(lock.isOwned('working-tree', 'run-1')).toBe(false);
    expect(existsSync(join(workspace, 'runtime', 'locks', 'working-tree.lock'))).toBe(false);
  });

  it('allows different runs to lock different resources concurrently', () => {
    const first = new RuntimeResourceLock(workspace);
    const second = new RuntimeResourceLock(workspace);
    first.acquire('working-tree-src-a', 'run-1');
    second.acquire('working-tree-src-b', 'run-2');
    expect(first.isOwned('working-tree-src-a', 'run-1')).toBe(true);
    expect(second.isOwned('working-tree-src-b', 'run-2')).toBe(true);
    first.release('working-tree-src-a', 'run-1');
    second.release('working-tree-src-b', 'run-2');
  });

  it('blocks two runs from owning the same resource', () => {
    const first = new RuntimeResourceLock(workspace);
    const second = new RuntimeResourceLock(workspace);
    first.acquire('working-tree-src-a', 'run-1');
    expect(() => second.acquire('working-tree-src-a', 'run-2')).toThrow('LOOP_BLOCKED');
    first.release('working-tree-src-a', 'run-1');
  });

  it('does not allow a different run to release the resource lock', () => {
    const lock = new RuntimeResourceLock(workspace);
    lock.acquire('working-tree', 'run-1');
    expect(() => lock.release('working-tree', 'run-2')).toThrow('does not own resource lock');
    expect(lock.isOwned('working-tree', 'run-1')).toBe(true);
    lock.release('working-tree', 'run-1');
  });
});
