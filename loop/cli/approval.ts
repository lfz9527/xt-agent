import type { HumanApprovalGateName, HumanApprovalDecision } from '../runtime/human-approval';
import type { ApprovalService } from './approval-service';

export interface ApprovalCliOptions {
  service?: Pick<ApprovalService, 'resolve'>;
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
}

export interface ApprovalCliResult {
  exitCode: number;
}

export function runApprovalCommand(
  args: string[],
  decision: HumanApprovalDecision,
  options: ApprovalCliOptions = {},
): ApprovalCliResult {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const runId = args.find((arg) => !arg.startsWith('--'));
  const gateArg = args.find((arg) => arg.startsWith('--gate='));

  if (!runId || args.length !== 2 || !gateArg) {
    stderr.write(`[LOOP_BLOCKED] ${decision === 'approved' ? 'approve' : 'reject'} requires <run-id> --gate=<execution|final>\n`);
    return { exitCode: 2 };
  }

  const gate = gateArg.slice('--gate='.length);
  if (gate !== 'execution' && gate !== 'final') {
    stderr.write('[LOOP_BLOCKED] invalid approval gate\n');
    return { exitCode: 2 };
  }

  if (!options.service) {
    stderr.write('[LOOP_BLOCKED] ApprovalService adapter is not configured\n');
    return { exitCode: 1 };
  }

  try {
    const state = options.service.resolve(runId, gate as HumanApprovalGateName, decision);
    stdout.write(`Run: ${state.runId}\nStatus: ${state.status}\nDecision: ${decision}\nGate: ${gate}\n`);
    return { exitCode: 0 };
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

export function runApproveCommand(args: string[], options: ApprovalCliOptions = {}): ApprovalCliResult {
  return runApprovalCommand(args, 'approved', options);
}

export function runRejectCommand(args: string[], options: ApprovalCliOptions = {}): ApprovalCliResult {
  return runApprovalCommand(args, 'rejected', options);
}
