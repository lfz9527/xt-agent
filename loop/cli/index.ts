#!/usr/bin/env node
import { runReplayCommand } from './replay';
import { runResumeCommand } from './resume';
import { runRunCommand } from './run';
import type { RunService } from './run-service';
import type { ReplayService } from './service';

export interface CliServices {
  replay?: Pick<ReplayService, 'execute'>;
  run?: Pick<RunService, 'run'>;
  resume?: Pick<RunService, 'resume'>;
}

export async function runCli(argv: string[] = process.argv.slice(2), services: CliServices = {}): Promise<number> {
  const [command, ...args] = argv;

  if (command === 'replay') return runReplayCommand(args, { service: services.replay }).exitCode;
  if (command === 'run') return (await runRunCommand(args, { service: services.run })).exitCode;
  if (command === 'resume') return (await runResumeCommand(args, { service: services.resume })).exitCode;

  process.stderr.write('[LOOP_BLOCKED] supported commands: replay, run, resume\n');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((exitCode) => { process.exitCode = exitCode; });
}
