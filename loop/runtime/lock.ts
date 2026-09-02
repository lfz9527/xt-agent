import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type RuntimeResourceKind = 'readonly' | 'mutable' | 'protected';

export interface RuntimeResourceLockRecord {
  runId: string;
  resource: string;
  acquiredAt: string;
  pid?: number;
}

/**
 * 资源级互斥锁。
 *
 * Lock 不决定资源“能不能修改”；它只保证同一资源在同一时刻只有一个 Run
 * 可以进行互斥修改。资源是否可修改由 ResourcePolicy 决定。
 */
export class RuntimeResourceLock {
  private readonly locksDir: string;
  private readonly owned = new Map<string, { fd: number; runId: string }>();

  constructor(workspace = '.loop') {
    this.locksDir = join(workspace, 'runtime', 'locks');
  }

  acquire(resource: string, runId: string): void {
    this.validate(resource, runId);
    const lockPath = this.pathFor(resource);
    mkdirSync(this.locksDir, { recursive: true });

    try {
      const fd = openSync(lockPath, 'wx');
      const record: RuntimeResourceLockRecord = {
        runId,
        resource,
        acquiredAt: new Date().toISOString(),
        pid: process.pid,
      };
      writeFileSync(fd, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
      this.owned.set(resource, { fd, runId });
    } catch {
      let holder = 'unknown';
      if (existsSync(lockPath)) {
        try {
          holder = readFileSync(lockPath, 'utf8').trim() || holder;
        } catch {
          // 锁文件不可读时保持阻断，不猜测并发状态。
        }
      }
      throw new Error(`[LOOP_BLOCKED] resource is locked: ${resource}; holder=${holder}`);
    }
  }

  assertOwned(resource: string, runId: string): void {
    const owner = this.owned.get(resource);
    if (!owner || owner.runId !== runId) {
      throw new Error(`[LOOP_BLOCKED] run does not own resource lock: ${resource}`);
    }
  }

  release(resource: string, runId: string): void {
    this.assertOwned(resource, runId);
    const owner = this.owned.get(resource)!;
    const lockPath = this.pathFor(resource);
    try {
      const record = JSON.parse(readFileSync(lockPath, 'utf8')) as RuntimeResourceLockRecord;
      if (record.runId !== runId || record.resource !== resource) {
        throw new Error(`[LOOP_BLOCKED] resource lock owner mismatch: ${resource}`);
      }
      unlinkSync(lockPath);
      closeSync(owner.fd);
      this.owned.delete(resource);
    } catch (error) {
      throw error instanceof Error ? error : new Error(`[LOOP_BLOCKED] failed to release resource lock: ${resource}`);
    }
  }

  isOwned(resource: string, runId: string): boolean {
    const owner = this.owned.get(resource);
    return owner?.runId === runId;
  }

  private pathFor(resource: string): string {
    const safe = resource.replace(/[^a-zA-Z0-9._-]+/g, '_');
    if (!safe) throw new Error('[LOOP_BLOCKED] invalid resource name');
    return join(this.locksDir, `${safe}.lock`);
  }

  private validate(resource: string, runId: string): void {
    if (!resource.trim()) throw new Error('[LOOP_BLOCKED] resource is required');
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required');
  }
}
