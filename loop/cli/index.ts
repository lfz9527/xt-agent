#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runAgentCommand } from './agent';
import { createDefaultAgentRuntimeService } from './default-agent-service';
import { runApproveCommand, runRejectCommand } from './approval';
import { runReplayCommand } from './replay';
import { runResumeCommand } from './resume';
import { runRunCommand } from './run';
import type { AgentRuntimeService } from './agent-service';
import type { ApprovalService } from './approval-service';
import type { RunService } from './run-service';
import type { ReplayService } from './service';

export interface CliServices {
  agent?: Pick<AgentRuntimeService, 'start' | 'status' | 'submit' | 'pause' | 'approve'>;
  replay?: Pick<ReplayService, 'execute'>;
  run?: Pick<RunService, 'run'>;
  resume?: Pick<RunService, 'resume'>;
  approval?: Pick<ApprovalService, 'resolve'>;
}

export async function runCli(argv: string[] = process.argv.slice(2), services: CliServices = {}): Promise<number> {
  const [command, ...args] = argv;

  if (command === 'agent') {
    const agent = services.agent ?? createDefaultAgentRuntimeService();
    return (await runAgentCommand(args, { service: agent })).exitCode;
  }
  if (command === 'replay') return runReplayCommand(args, { service: services.replay }).exitCode;
  if (command === 'run') return (await runRunCommand(args, { service: services.run })).exitCode;
  if (command === 'resume') return (await runResumeCommand(args, { service: services.resume })).exitCode;
  if (command === 'approve') return runApproveCommand(args, { service: services.approval }).exitCode;
  if (command === 'reject') return runRejectCommand(args, { service: services.approval }).exitCode;

  process.stderr.write('[LOOP_BLOCKED] supported commands: agent, replay, run, resume, approve, reject\n');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((exitCode) => { process.exitCode = exitCode; });
}
