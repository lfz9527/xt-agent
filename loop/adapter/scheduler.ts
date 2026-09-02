import type { LoopRuntimeState } from '../runtime/kernel';
import type { RunService } from '../cli/run-service';

export interface SchedulerRuntimePort {
  run(): Promise<LoopRuntimeState>;
}

export interface SchedulerTimerPort {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export interface SchedulerJob {
  id: string;
  delayMs?: number;
  intervalMs?: number;
}

export interface SchedulerHandle {
  id: string;
  cancel(): void;
}

/**
 * P2-10 Adapter：Scheduler 只负责“何时触发”，不拥有 Loop Runtime 状态。
 * 每次触发都委托给共享 RunService；状态机、Policy、Permission、Trust、Approval
 * 与 Evidence 均由 Runtime / RunService 负责。
 */
export class SchedulerRuntimeAdapter {
  private readonly jobs = new Map<string, SchedulerHandle>();
  private readonly timer: SchedulerTimerPort;
  private readonly runtime: SchedulerRuntimePort;

  constructor(runtime: SchedulerRuntimePort | RunService, timer?: SchedulerTimerPort) {
    this.runtime = runtime;
    this.timer = timer ?? {
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle),
      setInterval: (callback, delayMs) => setInterval(callback, delayMs),
      clearInterval: (handle) => clearInterval(handle),
    };
  }

  schedule(job: SchedulerJob): SchedulerHandle {
    this.validateJob(job);
    if (this.jobs.has(job.id)) throw new Error(`[LOOP_BLOCKED] scheduler job already exists: ${job.id}`);

    const cancel = () => this.cancel(job.id);
    const handle: SchedulerHandle = { id: job.id, cancel };
    const trigger = () => {
      void this.runtime.run().catch(() => undefined);
    };

    if (job.intervalMs !== undefined) {
      const timerHandle = this.timer.setInterval(trigger, job.intervalMs);
      this.jobs.set(job.id, {
        id: job.id,
        cancel: () => this.timer.clearInterval(timerHandle),
      });
    } else {
      const timerHandle = this.timer.setTimeout(() => {
        this.jobs.delete(job.id);
        trigger();
      }, job.delayMs ?? 0);
      this.jobs.set(job.id, {
        id: job.id,
        cancel: () => {
          this.timer.clearTimeout(timerHandle);
          this.jobs.delete(job.id);
        },
      });
    }

    return handle;
  }

  cancel(id: string): boolean {
    const handle = this.jobs.get(id);
    if (!handle) return false;
    handle.cancel();
    this.jobs.delete(id);
    return true;
  }

  cancelAll(): void {
    for (const id of [...this.jobs.keys()]) this.cancel(id);
  }

  has(id: string): boolean {
    return this.jobs.has(id);
  }

  private validateJob(job: SchedulerJob): void {
    if (!job.id.trim()) throw new Error('[LOOP_BLOCKED] scheduler job id is required');
    const hasDelay = job.delayMs !== undefined;
    const hasInterval = job.intervalMs !== undefined;
    if (hasDelay === hasInterval) {
      throw new Error('[LOOP_BLOCKED] scheduler job requires exactly one of delayMs or intervalMs');
    }
    const value = hasInterval ? job.intervalMs : job.delayMs;
    if (!Number.isFinite(value) || value! < 0) {
      throw new Error('[LOOP_BLOCKED] scheduler delay must be a non-negative finite number');
    }
    if (hasInterval && value === 0) {
      throw new Error('[LOOP_BLOCKED] scheduler interval must be greater than zero');
    }
  }
}
