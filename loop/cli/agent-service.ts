import { ProjectLoopWorkspaceInitializer } from '../runtime/project-workspace';
import type { ExecutionRuntime, StageResult } from '../runtime/execution-runtime';
import type { HumanApprovalDecision, HumanApprovalGateName } from '../runtime/human-approval';
import type { LoopRuntimeKernel, LoopRuntimeState } from '../runtime/kernel';
import type { RunRuntime } from '../runtime/run-runtime';
import type { ApprovalService } from './approval-service';

export interface AgentRuntimeServiceOptions {
  runtime: Pick<RunRuntime, 'createRun' | 'loadRun' | 'pause'>;
  execution: Pick<ExecutionRuntime, 'completeStage'>;
  approval: Pick<ApprovalService, 'resolve'>;
  kernel: Pick<LoopRuntimeKernel, 'transition'>;
  workspace?: Pick<ProjectLoopWorkspaceInitializer, 'ensure'>;
  projectRoot?: string;
}

/**
 * Agent-facing Adapter. It exposes only run facts and stage results to Codex/Claude.
 * It never accepts a target status and never writes Runtime State directly.
 */
export class AgentRuntimeService {
  private readonly workspace: Pick<ProjectLoopWorkspaceInitializer, 'ensure'>;

  constructor(private readonly options: AgentRuntimeServiceOptions) {
    this.workspace = options.workspace ?? new ProjectLoopWorkspaceInitializer();
  }

  start(): LoopRuntimeState {
    this.workspace.ensure({ projectRoot: this.options.projectRoot });
    return this.options.runtime.createRun();
  }

  status(runId: string): LoopRuntimeState {
    return this.options.runtime.loadRun(runId);
  }

  submit(runId: string, result: StageResult): LoopRuntimeState {
    return this.options.execution.completeStage(runId, result);
  }

  pause(runId: string): LoopRuntimeState {
    return this.options.runtime.pause(runId);
  }

  approve(runId: string, gate: HumanApprovalGateName, decision: HumanApprovalDecision): LoopRuntimeState {
    this.options.approval.resolve(runId, gate, decision);
    if (gate === 'execution') {
      this.options.kernel.transition(decision === 'approved' ? 'PLAN' : 'BLOCKED');
    } else if (decision === 'rejected') {
      this.options.kernel.transition('FIX');
    }
    return this.options.runtime.loadRun(runId);
  }
}
