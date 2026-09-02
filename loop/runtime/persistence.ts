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
  type: 'STATE_TRANSITION' | 'APPROVAL_REQUESTED' | 'APPROVAL_RESOLVED' | 'BLOCKED' | 'RESOURCE_MUTATION';
  at: string;
  policyRevision: number;
  payload: Record<string, unknown>;
}

export interface RuntimeAuditLog {
  append(event: RuntimeAuditEvent): void;
}

export interface MutationJournalEntry {
  mutationId: string;
  runId: string;
  resource: string;
  capability: string;
  at: string;
  beforeWorktreeFingerprint: string;
  afterWorktreeFingerprint: string;
  result: 'committed' | 'failed';
}

export interface MutationJournal {
  append(entry: MutationJournalEntry): void;
}

/** 每个 Run 独立持有自己的 State；跨 Run 的事实只进入 append-only Audit Log。 */
export class FileStateStore {
  private readonly statePath: string;
  private readonly tempPath: string;

  constructor(private readonly workspace: string = '.loop', private readonly runId: string) {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for FileStateStore');
    this.statePath = join(workspace, 'runtime', 'runs', runId, 'state.yaml');
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
      facts: parsed.facts,
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
    if (state.runId !== this.runId || !state.status) {
      throw new Error('[LOOP_BLOCKED] invalid persistent runtime state for requested run');
    }
    if (!Number.isInteger(state.policyRevision) || state.policyRevision < 1) {
      throw new Error('[LOOP_BLOCKED] invalid persistent policy revision');
    }
    if (!state.snapshot || state.snapshot.runId !== state.runId || state.snapshot.policyRevision !== state.policyRevision) {
      throw new Error('[LOOP_BLOCKED] persistent policy snapshot does not match runtime state');
    }
    if (!state.facts) throw new Error('[LOOP_BLOCKED] runtime facts are required');
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

/** Mutation Journal 是 Loop 对工作区变更归属的不可变记录。 */
export class JsonlMutationJournal implements MutationJournal {
  private readonly journalPath: string;

  constructor(workspace: string = '.loop') {
    this.journalPath = join(workspace, 'runtime', 'mutation-journal.jsonl');
  }

  append(entry: MutationJournalEntry): void {
    mkdirSync(dirname(this.journalPath), { recursive: true });
    appendFileSync(this.journalPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  }
}

export function createRuntimeEventId(prefix = 'evt'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
