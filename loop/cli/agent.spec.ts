import { describe, expect, it, vi } from 'vitest';
import { runAgentCommand } from './agent';

const output = () => {
  let value = '';
  return { stream: { write: (chunk: string) => { value += chunk; } }, get: () => value };
};

const state = { runId: 'run-1', status: 'INIT' } as never;

describe('runAgentCommand', () => {
  it('starts a run through the Agent Runtime service', async () => {
    const io = output();
    const service = { start: vi.fn(() => state) } as never;

    const result = await runAgentCommand(['start'], { service, stdout: io.stream, stderr: io.stream });

    expect(result.exitCode).toBe(0);
    expect(service.start).toHaveBeenCalledOnce();
    expect(JSON.parse(io.get())).toEqual(state);
  });

  it('rejects a submit command with malformed JSON before invoking Runtime', async () => {
    const io = output();
    const service = { submit: vi.fn() } as never;

    const result = await runAgentCommand(['submit', 'run-1', '{bad'], { service, stdout: io.stream, stderr: io.stream });

    expect(result.exitCode).toBe(2);
    expect(service.submit).not.toHaveBeenCalled();
    expect(io.get()).toContain('valid JSON');
  });

  it('does not expose a target-status argument in the submit contract', async () => {
    const io = output();
    const service = { submit: vi.fn(() => state) } as never;

    const result = await runAgentCommand(['submit', 'run-1', JSON.stringify({ facts: {} }), 'IMPLEMENT'], { service, stdout: io.stream, stderr: io.stream });

    expect(result.exitCode).toBe(2);
    expect(service.submit).not.toHaveBeenCalled();
  });
});
