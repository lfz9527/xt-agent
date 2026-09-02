import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly workspace: string = '.loop') {}

  read(runId: string): ExecutionCheckpoint | undefined {
    const path = this.path(runId);
    if (!existsSync(path)) return undefined;
    let checkpoint: ExecutionCheckpoint;
    try {
      checkpoint = JSON.parse(readFileSync(path, 'utf8')) as ExecutionCheckpoint;
    } catch {
      throw new Error('[LOOP_BLOCKED] execution checkpoint is unreadable');
    }
    this.validate(checkpoint, runId);
    return checkpoint;
  }

  write(checkpoint: ExecutionCheckpoint): void {
    this.validate(checkpoint, checkpoint.runId);
    const path = this.path(checkpoint.runId);
    const tmp = `${path}.tmp`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
    renameSync(tmp, path);
  }

  clear(runId: string): void {
    const path = this.path(runId);
    if (existsSync(path)) unlinkSync(path);
  }

  private path(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error('[LOOP_BLOCKED] unsafe runId for checkpoint');
    return join(this.workspace, 'runtime', 'runs', runId, 'checkpoint.json');
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
