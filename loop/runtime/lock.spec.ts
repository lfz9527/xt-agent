import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RuntimeProjectLock } from './lock';

const workspace = join(process.cwd(), '.loop-lock-test');

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe('RuntimeProjectLock', () => {
  it('allows one run to acquire and release the project lock', () => {
    const lock = new RuntimeProjectLock(workspace);
    lock.acquire('run-1');
    expect(lock.isHeld()).toBe(true);
    expect(existsSync(join(workspace, 'runtime', 'run.lock'))).toBe(true);
    lock.release('run-1');
    expect(lock.isHeld()).toBe(false);
    expect(existsSync(join(workspace, 'runtime', 'run.lock'))).toBe(false);
  });

  it('blocks a second run while the project is locked', () => {
    const first = new RuntimeProjectLock(workspace);
    const second = new RuntimeProjectLock(workspace);
    first.acquire('run-1');
    expect(() => second.acquire('run-2')).toThrow('LOOP_BLOCKED');
    first.release('run-1');
  });

  it('does not allow a different run to release the lock', () => {
    const lock = new RuntimeProjectLock(workspace);
    lock.acquire('run-1');
    expect(() => lock.release('run-2')).toThrow('lock owner mismatch');
    expect(lock.isHeld()).toBe(true);
    lock.release('run-1');
  });
});
