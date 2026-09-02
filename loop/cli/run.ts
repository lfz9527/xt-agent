import type { LoopRuntimeState } from '../runtime/kernel';
import type { RunService } from './run-service';

export interface RunCliOptions {
  service?: Pick<RunService, 'run'>;
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
}

export interface RunCliResult {
  exitCode: number;
  state?: LoopRuntimeState;
}

export async function runRunCommand(args: string[], options: RunCliOptions): Promise<RunCliResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (args.length !== 0) {
    stderr.write('[LOOP_BLOCKED] run does not accept positional arguments\n');
    return { exitCode: 2 };
  }
  if (!options.service) {
    stderr.write('[LOOP_BLOCKED] RunService adapter is not configured\n');
    return { exitCode: 1 };
  }

  try {
    const state = await options.service.run();
    stdout.write(`Run: ${state.runId}\nStatus: ${state.status}\n`);
    return { exitCode: 0, state };
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}
