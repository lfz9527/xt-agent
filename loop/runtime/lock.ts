import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RuntimeLockRecord {
  runId: string;
  acquiredAt: string;
  pid?: number;
}

/** 项目级 Loop 互斥锁：同一 `.loop/` 同时只允许一个 Run 持有。 */
export class RuntimeProjectLock {
  private readonly lockPath: string;
  private fd: number | undefined;

  constructor(workspace = '.loop') {
    this.lockPath = `${workspace}/runtime/run.lock`;
  }

  acquire(runId: string): void {
    mkdirSync(dirname(this.lockPath), { recursive: true });
    try {
      this.fd = openSync(this.lockPath, 'wx');
      const record: RuntimeLockRecord = { runId, acquiredAt: new Date().toISOString(), pid: process.pid };
      writeFileSync(this.fd, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
    } catch (error) {
      let holder = 'unknown';
      if (existsSync(this.lockPath)) {
        try {
          holder = readFileSync(this.lockPath, 'utf8').trim() || holder;
        } catch {
          // 锁文件不可读时仍然保持阻断，不允许猜测并发状态。
        }
      }
      throw new Error(`[LOOP_BLOCKED] another Loop run already owns the project lock: ${holder}`);
    }
  }

  release(runId: string): void {
    if (this.fd === undefined) return;
    try {
      const record = JSON.parse(readFileSync(this.lockPath, 'utf8')) as RuntimeLockRecord;
      if (record.runId !== runId) throw new Error('[LOOP_BLOCKED] lock owner mismatch');
      unlinkSync(this.lockPath);
      closeSync(this.fd);
      this.fd = undefined;
    } catch (error) {
      throw error instanceof Error ? error : new Error('[LOOP_BLOCKED] failed to release project lock');
    }
  }

  isHeld(): boolean {
    return this.fd !== undefined;
  }
}
