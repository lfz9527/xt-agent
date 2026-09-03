import type { LoopRuntimeState } from '../runtime/kernel';
import type { StageResult } from '../runtime/execution-runtime';
import type { AgentRuntimeService } from './agent-service';

export interface AgentCliOptions {
  service?: Pick<AgentRuntimeService, 'start' | 'status' | 'submit' | 'pause' | 'approve'>;
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
}

export interface AgentCliResult {
  exitCode: number;
  state?: LoopRuntimeState;
}

const printState = (stdout: { write(chunk: string): void }, state: LoopRuntimeState): void => {
  stdout.write(`${JSON.stringify(state, null, 2)}\n`);
};

export async function runAgentCommand(args: string[], options: AgentCliOptions): Promise<AgentCliResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const service = options.service;

  if (!service) {
    stderr.write('[LOOP_BLOCKED] AgentRuntimeService adapter is not configured\n');
    return { exitCode: 1 };
  }

  try {
    const [action, ...rest] = args;
    if (action === 'start' && rest.length === 0) {
      const state = service.start();
      printState(stdout, state);
      return { exitCode: 0, state };
    }

    if (action === 'status' && rest.length === 1) {
      const state = service.status(rest[0]);
      printState(stdout, state);
      return { exitCode: 0, state };
    }

    if (action === 'pause' && rest.length === 1) {
      const state = service.pause(rest[0]);
      printState(stdout, state);
      return { exitCode: 0, state };
    }

    if (action === 'approve' && rest.length === 3) {
      const [runId, gate, decision] = rest;
      if (!['execution', 'final'].includes(gate) || !['approved', 'rejected'].includes(decision)) {
        stderr.write('[LOOP_BLOCKED] approve expects <runId> <execution|final> <approved|rejected>\n');
        return { exitCode: 2 };
      }
      const state = service.approve(runId, gate as 'execution' | 'final', decision as 'approved' | 'rejected');
      printState(stdout, state);
      return { exitCode: 0, state };
    }

    if (action === 'submit' && rest.length === 2) {
      const [runId, encoded] = rest;
      let result: StageResult;
      try {
        result = JSON.parse(encoded) as StageResult;
      } catch {
        stderr.write('[LOOP_BLOCKED] submit result must be valid JSON\n');
        return { exitCode: 2 };
      }
      const state = service.submit(runId, result);
      printState(stdout, state);
      return { exitCode: 0, state };
    }

    stderr.write('[LOOP_BLOCKED] supported agent commands: start, status <runId>, submit <runId> <json>, pause <runId>, approve <runId> <execution|final> <approved|rejected>\n');
    return { exitCode: 2 };
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}
