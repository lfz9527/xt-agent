import type { LoopRuntimeState } from '../runtime/kernel';
import type { RunService } from './run-service';

export interface ResumeCliOptions {
  service?: Pick<RunService, 'resume'>;
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
}

export interface ResumeCliResult {
  exitCode: number;
  state?: LoopRuntimeState;
}

export async function runResumeCommand(args: string[], options: ResumeCliOptions): Promise<ResumeCliResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const runId = args.find((arg) => !arg.startsWith('--'));

  if (!runId || args.length !== 1) {
    stderr.write('[LOOP_BLOCKED] resume requires exactly one run-id\n');
    return { exitCode: 2 };
  }
  if (!options.service) {
    stderr.write('[LOOP_BLOCKED] RunService adapter is not configured\n');
    return { exitCode: 1 };
  }

  try {
    const state = await options.service.resume(runId);
    stdout.write(`Run: ${state.runId}\nStatus: ${state.status}\n`);
    return { exitCode: 0, state };
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}
