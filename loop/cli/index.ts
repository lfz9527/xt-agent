#!/usr/bin/env node
import { runReplayCommand } from './replay';

export function runCli(argv: string[] = process.argv.slice(2)): number {
  const [command, ...args] = argv;

  if (command !== 'replay') {
    process.stderr.write('[LOOP_BLOCKED] supported command: replay <run-id> [--json]\n');
    return 2;
  }

  return runReplayCommand(args).exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCli();
}
