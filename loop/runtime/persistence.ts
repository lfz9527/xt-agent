import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LoopRuntimeState } from './kernel';

export const RUNTIME_STATE_SCHEMA_VERSION = 1;
export interface PersistedLoopRuntimeState extends LoopRuntimeState { schemaVersion: number; }
export interface RuntimeAuditEvent { eventId: string; runId: string; type: 'STATE_TRANSITION' | 'APPROVAL_REQUESTED' | 'APPROVAL_RESOLVED' | 'BLOCKED' | 'RESOURCE_MUTATION'; at: string; policyRevision: number; payload: Record<string, unknown>; }
export interface RuntimeAuditLog { append(event: RuntimeAuditEvent): void; }
export interface MutationJournalEntry { mutationId: string; runId: string; resource: string; capability: string; at: string; beforeWorktreeFingerprint: string; afterWorktreeFingerprint: string; result: 'committed' | 'failed'; }
export interface MutationJournal { append(entry: MutationJournalEntry): void; }

export class FileStateStore {
  private readonly statePath: string;
  private readonly tempPath: string;
  constructor(private readonly workspace: string = '.loop', private readonly runId: string) {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for FileStateStore');
    this.statePath = join(workspace, 'runtime', 'runs', runId, 'state.yaml'); this.tempPath = `${this.statePath}.tmp`;
  }
  read(): LoopRuntimeState {
    const path = this.recoverPath();
    if (!path) {
      if (this.hasStateForAnotherRun()) throw new Error('[LOOP_BLOCKED] persistent runtime state belongs to another requested run');
      throw new Error('[LOOP_BLOCKED] persistent runtime state is missing');
    }
    let parsed: PersistedLoopRuntimeState;
    try { parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedLoopRuntimeState; } catch { throw new Error('[LOOP_BLOCKED] persistent runtime state is unreadable'); }
    this.validate(parsed);
    return { runId: parsed.runId, status: parsed.status, policyRevision: parsed.policyRevision, snapshot: parsed.snapshot, facts: parsed.facts, gitBaseline: parsed.gitBaseline, expectedWorktreeFingerprint: parsed.expectedWorktreeFingerprint };
  }
  write(next: LoopRuntimeState): void {
    this.validate({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION }); mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.tempPath, `${JSON.stringify({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION }, null, 2)}\n`, { encoding: 'utf8', flag: 'w' }); renameSync(this.tempPath, this.statePath);
  }
  private recoverPath(): string | undefined {
    const mainExists = existsSync(this.statePath), tempExists = existsSync(this.tempPath);
    if (!mainExists && tempExists) { renameSync(this.tempPath, this.statePath); return this.statePath; }
    if (mainExists && tempExists) { if (statSync(this.tempPath).mtimeMs > statSync(this.statePath).mtimeMs) renameSync(this.tempPath, this.statePath); else unlinkSync(this.tempPath); }
    return mainExists || existsSync(this.statePath) ? this.statePath : undefined;
  }
  private hasStateForAnotherRun(): boolean {
    const runsRoot = join(this.workspace, 'runtime', 'runs');
    if (!existsSync(runsRoot)) return false;
    return requireRunDirectories(runsRoot).some((run) => run !== this.runId && existsSync(join(runsRoot, run, 'state.yaml')));
  }
  private validate(state: PersistedLoopRuntimeState): void {
    if (state.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION) throw new Error('[LOOP_BLOCKED] unsupported runtime state schema version');
    if (state.runId !== this.runId || !state.status) throw new Error('[LOOP_BLOCKED] invalid persistent runtime state for requested run');
    if (!Number.isInteger(state.policyRevision) || state.policyRevision < 1) throw new Error('[LOOP_BLOCKED] invalid persistent policy revision');
    if (!state.snapshot || state.snapshot.runId !== state.runId || state.snapshot.policyRevision !== state.policyRevision) throw new Error('[LOOP_BLOCKED] persistent policy snapshot does not match runtime state');
    if (!state.facts) throw new Error('[LOOP_BLOCKED] runtime facts are required');
  }
}

function requireRunDirectories(runsRoot: string): string[] {
  // 延迟引入 fs.readdirSync，保持当前 persistence API 的最小依赖面。
  return readFileSync(join(runsRoot, '.runs-index'), 'utf8').split('\n').filter(Boolean);
}

export class JsonlRuntimeAuditLog implements RuntimeAuditLog {
  private readonly historyPath: string;
  constructor(workspace: string = '.loop') { this.historyPath = join(workspace, 'runtime', 'history.jsonl'); }
  append(event: RuntimeAuditEvent): void { mkdirSync(dirname(this.historyPath), { recursive: true }); appendFileSync(this.historyPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' }); }
}

/** 每个 Run 独立持有 Mutation Journal，避免多个 Run 混淆变更归属。 */
export class JsonlMutationJournal implements MutationJournal {
  private readonly journalPath: string;
  constructor(workspace: string = '.loop', runId: string) {
    if (!runId.trim()) throw new Error('[LOOP_BLOCKED] runId is required for MutationJournal');
    this.journalPath = join(workspace, 'runtime', 'runs', runId, 'mutation-journal.jsonl');
  }
  append(entry: MutationJournalEntry): void { mkdirSync(dirname(this.journalPath), { recursive: true }); appendFileSync(this.journalPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' }); }
}

export function createRuntimeEventId(prefix = 'evt'): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
