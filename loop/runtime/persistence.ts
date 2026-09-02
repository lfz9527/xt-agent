import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LoopRuntimeState } from './kernel';

export const RUNTIME_STATE_SCHEMA_VERSION = 1;
export interface PersistedLoopRuntimeState extends LoopRuntimeState { schemaVersion: number; }
export type RuntimeAuditEventType = 'STATE_TRANSITION' | 'STAGE' | 'CHECKPOINT' | 'EVIDENCE' | 'APPROVAL_REQUESTED' | 'APPROVAL_RESOLVED' | 'BLOCKED' | 'RESOURCE_MUTATION';
export interface RuntimeAuditEvent { eventId: string; runId: string; type: RuntimeAuditEventType; at: string; policyRevision: number; payload: Record<string, unknown>; }
export interface RuntimeAuditLog { append(event: RuntimeAuditEvent): void; }
export interface MutationJournalEntry { mutationId: string; runId: string; resource: string; capability: string; at: string; beforeWorktreeFingerprint: string; afterWorktreeFingerprint: string; result: 'committed' | 'failed'; }
export interface MutationJournal { append(entry: MutationJournalEntry): void; }

const SAFE_RUN_ID = /^[A-Za-z0-9._-]+$/;

function validateRunId(runId: string, subject: string): void {
  if (!runId.trim() || runId !== runId.trim() || !SAFE_RUN_ID.test(runId) || runId === '.' || runId === '..') {
    throw new Error(`[LOOP_BLOCKED] invalid runId for ${subject}`);
  }
}

export class FileStateStore {
  private readonly statePath: string;
  constructor(private readonly workspace: string = '.loop', private readonly runId: string) {
    validateRunId(runId, 'FileStateStore');
    this.statePath = join(workspace, 'runtime', 'runs', runId, 'state.yaml');
  }

  read(): LoopRuntimeState {
    const path = this.recoverPath();
    if (!path) {
      if (this.hasStateForAnotherRun()) throw new Error('[LOOP_BLOCKED] persistent runtime state belongs to another requested run');
      throw new Error('[LOOP_BLOCKED] persistent runtime state is missing');
    }
    let parsed: PersistedLoopRuntimeState;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedLoopRuntimeState;
    } catch {
      throw new Error('[LOOP_BLOCKED] persistent runtime state is unreadable');
    }
    this.validate(parsed);
    return { runId: parsed.runId, status: parsed.status, policyRevision: parsed.policyRevision, snapshot: parsed.snapshot, facts: parsed.facts, gitBaseline: parsed.gitBaseline, expectedWorktreeFingerprint: parsed.expectedWorktreeFingerprint };
  }

  write(next: LoopRuntimeState): void {
    this.validate({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION });
    mkdirSync(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(temporaryPath, `${JSON.stringify({ ...next, schemaVersion: RUNTIME_STATE_SCHEMA_VERSION }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, this.statePath);
  }

  private recoverPath(): string | undefined {
    const directory = dirname(this.statePath);
    const mainExists = existsSync(this.statePath);
    if (!existsSync(directory)) return undefined;
    const temporaryPaths = readdirSync(directory)
      .filter((name) => name.startsWith('state.yaml.tmp-'))
      .map((name) => join(directory, name))
      .sort();

    if (!mainExists && temporaryPaths.length > 0) {
      const newest = temporaryPaths.at(-1)!;
      renameSync(newest, this.statePath);
      for (const stale of temporaryPaths.slice(0, -1)) if (existsSync(stale)) unlinkSync(stale);
      return this.statePath;
    }

    if (mainExists) for (const stale of temporaryPaths) if (existsSync(stale)) unlinkSync(stale);
    return mainExists ? this.statePath : undefined;
  }

  private hasStateForAnotherRun(): boolean {
    const runsRoot = join(this.workspace, 'runtime', 'runs');
    if (!existsSync(runsRoot)) return false;
    return readdirSync(runsRoot, { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name !== this.runId && existsSync(join(runsRoot, entry.name, 'state.yaml')));
  }

  private validate(state: PersistedLoopRuntimeState): void {
    if (state.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION) throw new Error('[LOOP_BLOCKED] unsupported runtime state schema version');
    if (state.runId !== this.runId || !state.status) throw new Error('[LOOP_BLOCKED] invalid persistent runtime state for requested run');
    if (!Number.isInteger(state.policyRevision) || state.policyRevision < 1) throw new Error('[LOOP_BLOCKED] invalid persistent policy revision');
    if (!state.snapshot || state.snapshot.runId !== state.runId || state.snapshot.policyRevision !== state.policyRevision) throw new Error('[LOOP_BLOCKED] persistent policy snapshot does not match runtime state');
    if (!state.facts) throw new Error('[LOOP_BLOCKED] runtime facts are required');
  }
}

export class JsonlRuntimeAuditLog implements RuntimeAuditLog {
  private readonly historyPath: string;
  constructor(workspace: string = '.loop') { this.historyPath = join(workspace, 'runtime', 'history.jsonl'); }
  append(event: RuntimeAuditEvent): void { mkdirSync(dirname(this.historyPath), { recursive: true }); appendFileSync(this.historyPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' }); }
}

export class JsonlMutationJournal implements MutationJournal {
  private readonly journalPath: string;
  private readonly runId: string;
  constructor(workspace: string = '.loop', runId: string) { validateRunId(runId, 'MutationJournal'); this.runId = runId; this.journalPath = join(workspace, 'runtime', 'runs', runId, 'mutation-journal.jsonl'); }
  append(entry: MutationJournalEntry): void {
    if (entry.runId !== this.runId) throw new Error('[LOOP_BLOCKED] mutation journal runId does not match its storage boundary');
    mkdirSync(dirname(this.journalPath), { recursive: true });
    appendFileSync(this.journalPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  }
}

export function createRuntimeEventId(prefix = 'evt'): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
