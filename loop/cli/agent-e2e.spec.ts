import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const loopRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bin = join(loopRoot, 'cli', 'bin.mjs');

function runAgentSync(cwd: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [bin, 'agent', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const result = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: result.status ?? 1,
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  }
}

function stateOf(result: { stdout: string }): { runId: string; status: string } {
  return JSON.parse(result.stdout) as { runId: string; status: string };
}

describe('real /loop agent CLI E2E', () => {
  it('executes Agent CLI -> Runtime Kernel -> State Machine -> .loop persistence', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'loop-e2e-'));
    execFileSync('git', ['init'], { cwd: projectRoot, stdio: 'ignore' });

    const start = runAgentSync(projectRoot, 'start');
    expect(start.status).toBe(0);
    const runId = stateOf(start).runId;
    expect(stateOf(start).status).toBe('INIT');

    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, '{}')).status).toBe('GOAL_REVIEW');
    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, '{}')).status).toBe('WAITING_FOR_GOAL_CONFIRMATION');
    expect(stateOf(runAgentSync(projectRoot, 'approve', runId, 'execution', 'approved')).status).toBe('PLAN');
    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, JSON.stringify({ facts: { planArtifactExists: true } }))).status).toBe('IMPLEMENT');
    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, JSON.stringify({ facts: { implementationCompleted: true } }))).status).toBe('VERIFY');
    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, JSON.stringify({ facts: { verificationPassed: true } }))).status).toBe('REVIEW');
    expect(stateOf(runAgentSync(projectRoot, 'submit', runId, JSON.stringify({ facts: { reviewPassed: true } }))).status).toBe('READY_FOR_CONFIRMATION');
    expect(stateOf(runAgentSync(projectRoot, 'approve', runId, 'final', 'approved')).status).toBe('READY_FOR_CONFIRMATION');

    const done = runAgentSync(projectRoot, 'submit', runId, JSON.stringify({
      facts: { acceptancePassed: true },
      evidence: [{ id: 'e2e-acceptance', runId, criterion: 'real agent CLI reaches DONE', status: 'passed', confidence: 'high' }],
    }));
    expect(done.status).toBe(0);
    expect(stateOf(done).status).toBe('DONE');

    const statePath = join(projectRoot, '.loop', 'runtime', 'runs', runId, 'state.yaml');
    const historyPath = join(projectRoot, '.loop', 'runtime', 'history.jsonl');
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as { runId: string; status: string };
    const history = readFileSync(historyPath, 'utf8');

    expect(state).toMatchObject({ runId, status: 'DONE' });
    expect(history).toContain('STATE_TRANSITION');
    expect(history).toContain('"from":"READY_FOR_CONFIRMATION","to":"DONE"');
    expect(readFileSync(join(projectRoot, '.loop', 'config.yaml'), 'utf8')).toContain('policyRevision: 1');
  });

  it('rejects Agent attempts to provide a target status', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'loop-e2e-blocked-'));
    execFileSync('git', ['init'], { cwd: projectRoot, stdio: 'ignore' });
    const start = runAgentSync(projectRoot, 'start');
    const runId = stateOf(start).runId;
    const blocked = runAgentSync(projectRoot, 'submit', runId, '{}', 'IMPLEMENT');

    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('[LOOP_BLOCKED]');
    expect(stateOf(runAgentSync(projectRoot, 'status', runId)).status).toBe('INIT');
  });
});
