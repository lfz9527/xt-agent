import { describe, expect, it } from 'vitest';
import { runApproveCommand, runRejectCommand } from './approval';

function io() {
  let out = '';
  let err = '';
  return {
    stdout: { write: (chunk: string) => { out += chunk; } },
    stderr: { write: (chunk: string) => { err += chunk; } },
    get out() { return out; },
    get err() { return err; },
  };
}

describe('approval CLI', () => {
  it('approves through the adapter', () => {
    const output = io();
    const calls: unknown[] = [];
    const result = runApproveCommand(['run-1', '--gate=execution'], {
      stdout: output.stdout,
      stderr: output.stderr,
      service: {
        resolve: (runId, gate, decision) => {
          calls.push([runId, gate, decision]);
          return { runId, status: 'PLAN' } as never;
        },
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([['run-1', 'execution', 'approved']]);
    expect(output.out).toContain('Decision: approved');
  });

  it('rejects through the adapter', () => {
    const output = io();
    const calls: unknown[] = [];
    const result = runRejectCommand(['run-2', '--gate=final'], {
      stdout: output.stdout,
      stderr: output.stderr,
      service: {
        resolve: (runId, gate, decision) => {
          calls.push([runId, gate, decision]);
          return { runId, status: 'READY_FOR_CONFIRMATION' } as never;
        },
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([['run-2', 'final', 'rejected']]);
  });

  it('blocks missing gate', () => {
    const output = io();
    const result = runApproveCommand(['run-1'], { stdout: output.stdout, stderr: output.stderr });
    expect(result.exitCode).toBe(2);
    expect(output.err).toContain('[LOOP_BLOCKED]');
  });

  it('blocks unknown gate', () => {
    const output = io();
    const result = runApproveCommand(['run-1', '--gate=unknown'], { stdout: output.stdout, stderr: output.stderr });
    expect(result.exitCode).toBe(2);
    expect(output.err).toContain('invalid approval gate');
  });

  it('returns non-zero when the Runtime gate rejects the operation', () => {
    const output = io();
    const result = runRejectCommand(['run-1', '--gate=execution'], {
      stdout: output.stdout,
      stderr: output.stderr,
      service: {
        resolve: () => { throw new Error('[LOOP_BLOCKED] policy revision mismatch'); },
      },
    });

    expect(result.exitCode).toBe(1);
    expect(output.err).toContain('policy revision mismatch');
  });
});
