import { describe, expect, it, vi } from 'vitest';
import { runResumeCommand } from './resume';
import { runRunCommand } from './run';

const output = () => {
  const chunks: string[] = [];
  return { stream: { write: (chunk: string) => chunks.push(chunk) }, text: () => chunks.join('') };
};

describe('run/resume cli adapters', () => {
  it('rejects run arguments', async () => {
    const err = output();
    const result = await runRunCommand(['extra'], { stderr: err.stream });
    expect(result.exitCode).toBe(2);
    expect(err.text()).toContain('[LOOP_BLOCKED]');
  });

  it('returns non-zero when the runtime adapter is not configured', async () => {
    const err = output();
    const result = await runRunCommand([], { stderr: err.stream });
    expect(result.exitCode).toBe(1);
    expect(err.text()).toContain('RunService adapter is not configured');
  });

  it('runs a configured service', async () => {
    const out = output();
    const service = { run: vi.fn(async () => ({ runId: 'run-1', status: 'PAUSED' })) };
    const result = await runRunCommand([], { service: service as never, stdout: out.stream });
    expect(result.exitCode).toBe(0);
    expect(out.text()).toContain('Run: run-1');
    expect(out.text()).toContain('Status: PAUSED');
  });

  it('requires exactly one run id for resume', async () => {
    const err = output();
    const result = await runResumeCommand([], { stderr: err.stream });
    expect(result.exitCode).toBe(2);
    expect(err.text()).toContain('resume requires exactly one run-id');
  });

  it('does not turn runtime failures into success', async () => {
    const err = output();
    const service = { resume: vi.fn(async () => { throw new Error('[LOOP_BLOCKED] policy revision mismatch') }) };
    const result = await runResumeCommand(['run-1'], { service: service as never, stderr: err.stream });
    expect(result.exitCode).toBe(1);
    expect(err.text()).toContain('policy revision mismatch');
  });
});
