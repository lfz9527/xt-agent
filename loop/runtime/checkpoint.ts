import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExecutionStage } from './execution-runtime';

export const CHECKPOINT_SCHEMA_VERSION = 1;

export interface ExecutionCheckpoint {
  schemaVersion: number;
  runId: string;
  stage: ExecutionStage;
  checkpointId: string;
  inputFingerprint: string;
  facts: Record<string, unknown>;
  nextStatus?: string;
  completedAt: string;
}

export interface CheckpointStore {
  read(runId: string): ExecutionCheckpoint | undefined;
  write(checkpoint: ExecutionCheckpoint): void;
  clear(runId: string): void;
}

const SAFE_RUN_ID = /^[A-Za-z0-9._-]+$/;

export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly workspace: string = '.loop') {}

  read(runId: string): ExecutionCheckpoint | undefined {
    const path = this.path(runId);
    const recoveredPath = this.recoverPath(path);
    if (!recoveredPath) return undefined;
    let checkpoint: ExecutionCheckpoint;
    try {
      checkpoint = JSON.parse(readFileSync(recoveredPath, 'utf8')) as ExecutionCheckpoint;
    } catch {
      throw new Error('[LOOP_BLOCKED] execution checkpoint is unreadable');
    }
    this.validate(checkpoint, runId);
    return checkpoint;
  }

  write(checkpoint: ExecutionCheckpoint): void {
    this.validate(checkpoint, checkpoint.runId);
    const path = this.path(checkpoint.runId);
    const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  }

  clear(runId: string): void {
    const path = this.path(runId);
    if (existsSync(path)) unlinkSync(path);
    const directory = dirname(path);
    if (existsSync(directory)) for (const name of readdirSync(directory)) if (name.startsWith('checkpoint.json.tmp-')) unlinkSync(join(directory, name));
  }

  private path(runId: string): string {
    if (!runId.trim() || runId !== runId.trim() || !SAFE_RUN_ID.test(runId) || runId === '.' || runId === '..') {
      throw new Error('[LOOP_BLOCKED] unsafe runId for checkpoint');
    }
    return join(this.workspace, 'runtime', 'runs', runId, 'checkpoint.json');
  }

  private recoverPath(path: string): string | undefined {
    const directory = dirname(path);
    const mainExists = existsSync(path);
    if (!existsSync(directory)) return undefined;
    const temporaryPaths = readdirSync(directory)
      .filter((name) => name.startsWith('checkpoint.json.tmp-'))
      .map((name) => join(directory, name))
      .sort();
    if (!mainExists && temporaryPaths.length > 0) {
      const newest = temporaryPaths.at(-1)!;
      renameSync(newest, path);
      for (const stale of temporaryPaths.slice(0, -1)) if (existsSync(stale)) unlinkSync(stale);
      return path;
    }
    if (mainExists) for (const stale of temporaryPaths) if (existsSync(stale)) unlinkSync(stale);
    return mainExists ? path : undefined;
  }

  private validate(checkpoint: ExecutionCheckpoint, runId: string): void {
    if (checkpoint.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) throw new Error('[LOOP_BLOCKED] unsupported checkpoint schema version');
    if (checkpoint.runId !== runId || !checkpoint.stage || !checkpoint.checkpointId) throw new Error('[LOOP_BLOCKED] invalid execution checkpoint');
    if (!checkpoint.inputFingerprint || !checkpoint.completedAt) throw new Error('[LOOP_BLOCKED] incomplete execution checkpoint');
    if (!checkpoint.facts || typeof checkpoint.facts !== 'object') throw new Error('[LOOP_BLOCKED] checkpoint facts are required');
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export function checkpointInputFingerprint(runId: string, stage: ExecutionStage, stateRevision: number, facts: Record<string, unknown>): string {
  return createHash('sha256')
    .update(stableSerialize({ runId, stage, stateRevision, facts }))
    .digest('hex');
}
