import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentRuntimeService } from './agent-service';
import { ApprovalService } from './approval-service';
import { ExecutionRuntime } from '../runtime/execution-runtime';
import { HumanApprovalGate } from '../runtime/human-approval';
import { LoopRuntimeKernel, type LoopRuntimeState, type StateStore } from '../runtime/kernel';
import { RuntimeResourceLock } from '../runtime/lock';
import { JsonlRuntimeAuditLog, FileStateStore } from '../runtime/persistence';
import { ProjectLoopWorkspaceInitializer } from '../runtime/project-workspace';
import { RunRuntime } from '../runtime/run-runtime';

class ProjectPolicy {
  constructor(private readonly workspace: string) {}

  currentRevision(): number {
    const config = readFileSync(resolve(this.workspace, 'config.yaml'), 'utf8');
    const match = config.match(/^policyRevision:\s*(\d+)\s*$/m);
    if (!match) throw new Error('[LOOP_BLOCKED] project policyRevision is missing');
    return Number(match[1]);
  }

  createSnapshot(runId: string) {
    const revision = this.currentRevision();
    return {
      runId,
      policyRevision: revision,
      trust: 'low',
      permissions: {},
      effectivePolicy: {},
      resolvedAt: new Date().toISOString(),
    };
  }
}

class DynamicStateStore implements StateStore {
  private activeRunId?: string;

  constructor(private readonly workspace: string) {}

  bind(runId: string): void {
    this.activeRunId = runId;
  }

  read(): LoopRuntimeState {
    if (!this.activeRunId) throw new Error('[LOOP_BLOCKED] active run is not configured');
    return new FileStateStore(this.workspace, this.activeRunId).read();
  }

  write(next: LoopRuntimeState): void {
    this.activeRunId = next.runId;
    new FileStateStore(this.workspace, next.runId).write(next);
  }
}

class AgentStageExecutor {
  async execute(): Promise<never> {
    throw new Error('[LOOP_BLOCKED] autonomous stage execution is not available through the Agent-facing adapter; submit a StageResult');
  }
}

export function createDefaultAgentRuntimeService(projectRoot?: string): AgentRuntimeService {
  const initializer = new ProjectLoopWorkspaceInitializer();
  const project = initializer.ensure({ projectRoot });
  const policy = new ProjectPolicy(project.workspace);
  const state = new DynamicStateStore(project.workspace);
  const audit = new JsonlRuntimeAuditLog(project.workspace);
  const lock = new RuntimeResourceLock(project.workspace);
  const kernel = new LoopRuntimeKernel(state, policy, undefined, audit, lock, undefined, project.projectRoot, undefined, {
    workspace: project.workspace,
  });
  const runs = new RunRuntime((runId) => {
    state.bind(runId);
    return new FileStateStore(project.workspace, runId);
  }, policy, {
    workspace: project.workspace,
    gitCwd: project.projectRoot,
    kernel,
  });
  const approvalGate = new HumanApprovalGate((runId) => new FileStateStore(project.workspace, runId), policy, audit);
  const approval = new ApprovalService({ gate: approvalGate });
  const execution = new ExecutionRuntime(runs, kernel, (runId) => {
    state.bind(runId);
    return new FileStateStore(project.workspace, runId);
  }, new AgentStageExecutor(), {
    workspace: project.workspace,
  });

  const runtime = new AgentRuntimeService({
    runtime: runs,
    execution,
    approval,
    kernel,
    workspace: initializer,
    projectRoot: project.projectRoot,
  });

  const originalStart = runtime.start.bind(runtime);
  const originalStatus = runtime.status.bind(runtime);
  const originalSubmit = runtime.submit.bind(runtime);
  const originalPause = runtime.pause.bind(runtime);
  const originalApprove = runtime.approve.bind(runtime);

  return {
    start: () => {
      const result = originalStart();
      state.bind(result.runId);
      return result;
    },
    status: (runId) => {
      state.bind(runId);
      return originalStatus(runId);
    },
    submit: (runId, result) => {
      state.bind(runId);
      return originalSubmit(runId, result);
    },
    pause: (runId) => {
      state.bind(runId);
      return originalPause(runId);
    },
    approve: (runId, gate, decision) => {
      state.bind(runId);
      return originalApprove(runId, gate, decision);
    },
  };
}
