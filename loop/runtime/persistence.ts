import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LoopRuntimeState } from './kernel';

export const RUNTIME_STATE_SCHEMA_VERSION = 1;

export interface PersistedLoopRuntimeState extends LoopRuntimeState {
  schemaVersion: number;
}

export interface RuntimeAuditEvent {
  eventId: string;
  runId: string;
  type: 'STATE_TRANSITION' | 'APPROVAL_REQUESTED' | 'APPROVAL_RESOLVED' | 'BLOCKED';
  at: string;
  policyRevision: number;
  payload: Record<string, unknown>;
}

export interface RuntimeAuditLog {
  append(event: RuntimeAuditEvent): void;
}

/**
 * 项目 `.loop/runtime/state.yaml` 的最小持久化实现。
 *
 * 文件内容使用 JSON 表示，因为 JSON 是 YAML 1.2 的合法子集；这样 Runtime
 * 不需要偷偷引入第二套 YAML 解析器，同时仍保持 `.yaml` 作为 Loop 的事实存储格式。
 * 所有写入均采用临时文件 + rename，避免进程崩溃留下半截 state。
 */
export class FileStateStore {
  private readonly statePath: string;
  private readonly tempPath: string;

  constructor(private readonly workspace: string = '.loop') {
    this.statePath = join(workspace, 'runtime', 'state.yaml');
    this.tempPath = `${this.statePath}.tmp`;
  }

  read(): LoopRuntimeState {
    const path = this.recoverPath();
    if (!path) throw new Error('[LOOP_BLOCKED] persistent runtime state is missing');

    let parsed: PersistedLoopRuntimeState;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedLoopRuntimeState;
    } catch {
      throw new Error('[LOOP_BLOCKED] persistent runtime state is unreadable');
    }

    this.validate(parsed);
    return {
      runId: parsed.runId,
      status: parsed.status,
      policyRevision: parsed.policyRevision,
      snapshot: parsed.snapshot,
    };
  }

  write(next: LoopRuntimeState): void {
    this.validate({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION });
    mkdirSync(dirname(this.statePath), { recursive: true });
    const serialized = `${JSON.stringify({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION }, null, 2)}\n`;
    writeFileSync(this.tempPath, serialized, { encoding: 'utf8', flag: 'w' });
    renameSync(this.tempPath, this.statePath);
  }

  private recoverPath(): string | undefined {
    const mainExists = existsSync(this.statePath);
    const tempExists = existsSync(this.tempPath);
    if (!mainExists && tempExists) {
      renameSync(this.tempPath, this.statePath);
      return this.statePath;
    }
    if (mainExists && tempExists) {
      const mainMtime = statSync(this.statePath).mtimeMs;
      const tempMtime = statSync(this.tempPath).mtimeMs;
      if (tempMtime > mainMtime) renameSync(this.tempPath, this.statePath);
      else unlinkSync(this.tempPath);
    }
    return mainExists || existsSync(this.statePath) ? this.statePath : undefined;
  }

  private validate(state: PersistedLoopRuntimeState): void {
    if (state.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION) {
      throw new Error('[LOOP_BLOCKED] unsupported runtime state schema version');
    }
    if (!state.runId || !state.status) throw new Error('[LOOP_BLOCKED] invalid persistent runtime state');
    if (!Number.isInteger(state.policyRevision) || state.policyRevision < 1) {
      throw new Error('[LOOP_BLOCKED] invalid persistent policy revision');
    }
    if (!state.snapshot || state.snapshot.runId !== state.runId || state.snapshot.policyRevision !== state.policyRevision) {
      throw new Error('[LOOP_BLOCKED] persistent policy snapshot does not match runtime state');
    }
  }
}

/** Append-only audit log. Never rewrites historical events. */
export class JsonlRuntimeAuditLog implements RuntimeAuditLog {
  private readonly historyPath: string;

  constructor(workspace: string = '.loop') {
    this.historyPath = join(workspace, 'runtime', 'history.jsonl');
  }

  append(event: RuntimeAuditEvent): void {
    mkdirSync(dirname(this.historyPath), { recursive: true });
    appendFileSync(this.historyPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
  }
}

export function createRuntimeEventId(prefix = 'evt'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
