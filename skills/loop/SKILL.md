---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety、Resource Governance 和 Evidence。

## Loop 入口初始化

`/loop` 的第一步永远是初始化或恢复当前项目的 `.loop/` 工作区。Agent 不得在完成这一步之前创建 Plan、Spec、Evidence、Review 或其他 Loop 产物。

### 初始化规则

1. Resolve Project Root：优先使用 Git repository root；非 Git 项目使用当前工作目录。
2. 检查 `<project-root>/.loop/` 是否存在。
3. 不存在时，通过 Loop Runtime 的 Project Workspace Initializer 创建完整 `.loop/` 工作区。
4. 已存在时执行同一个幂等初始化流程，补齐缺失的标准目录/文件，但不得覆盖已有项目配置、Runtime State 或 Loop 产物。
5. 初始化/恢复成功后，必须把解析出的 Project Workspace 作为整个 Runtime 的唯一持久化边界，再创建 Run。
6. Skill 不自行实现 `.loop` 的文件创建逻辑；必须委托 Runtime 的 Project Workspace Initializer。

标准项目工作区：

```text
<project-root>
└── .loop/
    ├── README.md
    ├── config.yaml
    ├── runtime/
    │   ├── runs/<run-id>/state.yaml
    │   ├── history.jsonl
    │   └── locks/<resource>.lock
    ├── plans/<run-id>.md
    ├── specs/<run-id>/<spec-id>.pecs.md
    ├── evidence/<run-id>/<evidence-id>.yaml
    └── reviews/<run-id>.md
```

`.loop/` 是项目级唯一 Loop 工作区。不同项目不得共享 `.loop`，运行产物不得写入 Skill 安装目录、Loop 引擎源码目录或其他项目目录。

## Project Root → Runtime Persistence

Project Root 一旦解析完成，所有文件型 Runtime 持久化组件必须从同一个 `ProjectLoopWorkspace` 创建，禁止各组件自行以 `process.cwd()` 解析 `.loop`。

```text
ProjectLoopWorkspaceInitializer.ensure()
                ↓
       ProjectLoopWorkspace
                ↓
     ProjectLoopRuntimeWorkspace
       ↙       ↓       ↘
 StateStore  ArtifactStore  AuditLog
       ↓          ↓            ↓
 .loop/runtime  .loop/*     .loop/runtime/history.jsonl
```

`ProjectLoopRuntimeWorkspace` 是统一持久化 wiring：

- `stateStore(runId)` → `<project-root>/.loop/runtime/runs/<run-id>/state.yaml`
- `artifactStore()` → `<project-root>/.loop/plans|specs|evidence|reviews`
- `auditLog()` → `<project-root>/.loop/runtime/history.jsonl`
- `mutationJournal(runId)` → `<project-root>/.loop/runtime/runs/<run-id>/mutation-journal.jsonl`
- `checkpointStore()` → `<project-root>/.loop/runtime/runs/<run-id>/checkpoint.json`

`RunRuntime`、`ExecutionRuntime`、`LoopRuntimeKernel` 使用这些组件时必须传入同一个 `.loop` workspace。不得出现“Initializer 写 Git 根目录 `.loop`，Store 却按当前 cwd 写另一份 `.loop`”的情况。

从 Git repository 子目录启动 `/loop` 时，所有上述路径仍必须指向 repository root 下的同一个 `.loop`。

## P2-11 Run Event / Observer API

Observer 是 Loop Runtime 的只读事件观察入口，用于 UI、CLI、Scheduler 和其他外部消费者观察 Run。

```text
Runtime Audit / Unified Audit Timeline
                 ↓
          Run Event Observer
           ↙      ↓      ↘
         UI      CLI    Scheduler
```

Observer 只提供两类能力：

- `list(runId)`：通过 Audit Replay 查询已经持久化的历史 Runtime Event。
- `subscribe(runId, observer)`：订阅该 Run 的新事件，并返回取消订阅函数。

观察范围与 Unified Audit Timeline 保持一致：`STAGE`、`CHECKPOINT`、`EVIDENCE`、`RESOURCE_MUTATION`、`STATE_TRANSITION`。

Observer 不得：

- 直接读写 `.loop/runtime/runs/<run-id>/state.yaml`。
- 修改 Runtime State 或 Runtime Facts。
- 实现第二套 State Machine、Policy、Permission、Trust、Approval 或 Evidence 决策。
- 创建新的事件事实源或复制一套 Run 状态。

Runtime Timeline 是唯一事件产生边界；Observer 只是消费方。

## P2-10 Scheduler Adapter

Scheduler 是 Loop Runtime 的时间入口，不是 Runtime 本身。

```text
Scheduler / cron / OS timer
          ↓
SchedulerRuntimeAdapter
          ↓
RunService.run()
          ↓
RunRuntime / Kernel / ExecutionRuntime
          ↓
Loop Runtime
```

Scheduler Adapter 只负责：

- 注册一次性或固定间隔触发。
- 校验 Job ID 和调度参数。
- 防止同一 Job ID 重复注册。
- 取消任务。
- 触发时委托共享 `RunService.run()`。

Scheduler 不得：

- 直接创建或修改 `.loop/runtime/runs/<run-id>/state.yaml`。
- 实现第二套 State Machine。
- 实现 Policy、Permission、Trust、Approval 或 Evidence。
- 自行判断 Run 是否允许执行。
- 绕过 Runtime 创建 Run。

当前 P2-10 只建立 Adapter Boundary，不绑定 cron parser、OS daemon 或桌面调度实现。未来不同调度器都必须通过该 Adapter 进入同一个 Runtime。

## P2-12 Loop v1 Hardening

P2-12 不增加新的状态机或第二套 Runtime，而是收紧已有边界，使 Loop v1 在并发、崩溃恢复和长期运行场景下保持可验证性。

### Persistence Hardening

- `runId` 在 State、Checkpoint、Mutation Journal、Audit Replay 文件边界统一执行安全校验，禁止路径穿越。
- State / Checkpoint 写入使用唯一临时文件后再 `rename`，避免共享 `.tmp` 文件竞争。
- 崩溃恢复识别遗留临时文件；多个候选只恢复最新候选并清理旧候选。
- Mutation Journal 写入必须与其 Run 存储边界一致，禁止跨 Run 写入。
- `.loop/runtime/history.jsonl` 是 Runtime Audit 唯一事实源；Replay Report 只能是派生结果。
- StateStore、ArtifactStore、AuditLog、MutationJournal、CheckpointStore 必须使用同一个 Project Root 解析出的 `.loop` workspace。

### Observer Hardening

- `unsubscribe()` 必须真正停止后续事件投递。
- Observer callback 属于非关键消费方；callback 抛错不能阻断 Audit Timeline、Runtime State 或主执行流程。
- Observer 只能消费 Runtime Event，不能修改 Runtime State，也不能创建新的事实源。

### Scheduler Hardening

- 同一 interval Job 使用 single-flight：上一次 `RunService.run()` 未结束时，后续 tick 不会重入启动新的 Run。
- Run 成功或失败后都释放该 Job 的执行占用，下一次 tick 可以继续。
- single-flight 只约束 Scheduler Job 自身，不复制 Runtime 的 State Machine、Lock、Policy 或 Approval。

### Adapter Contract

```text
/loop / CLI / Scheduler
          ↓
        Adapter
          ↓
      RunService
          ↓
      Loop Runtime
```

Adapter 只负责入口协议、参数校验和外部调度；Runtime 才是 State、Policy、Permission、Trust、Approval、Evidence、Mutation 和生命周期的唯一权威。

### Agent-facing Contract

`/loop` 在 Codex CLI、Claude CLI 等 Agent 宿主中运行时，Skill 本身不得承担 Loop 生命周期推进。Skill 必须把 Agent 行为限制在 Runtime 暴露的 Agent-facing Adapter 内。

核心不变量：

> Agent may perform work, but Agent may never advance the Run lifecycle.

Agent 可以：

- 读取当前 Run State。
- 根据当前 Stage 执行任务。
- 生成 Plan、Spec、Implementation、Verification、Review 等工作结果。
- 把 Facts / Evidence / StageResult 提交给 Runtime。
- 请求暂停、恢复或人工审批。

Agent 不可以：

- 直接修改 `.loop/runtime/runs/<run-id>/state.yaml`。
- 直接修改 Runtime Facts 作为生命周期事实源。
- 指定任意 `from → to` 状态迁移。
- 自己把“完成了”“测试通过了”声明为 DONE Evidence。
- 绕过 `RunService`、`ExecutionRuntime` 或 `LoopRuntimeKernel`。

Agent-facing CLI 的语义入口为：

```text
loop agent start
loop agent status <run-id>
loop agent submit <run-id> <stage-result-json>
loop agent pause <run-id>
loop agent approve <run-id> execution approved|rejected
loop agent approve <run-id> final approved|rejected
```

这些命令只是 Adapter Contract：

```text
Codex / Claude
      ↓
  /loop Skill
      ↓
 Agent CLI Adapter
      ↓
 AgentRuntimeService
      ↓
 Existing RunRuntime / ExecutionRuntime
      ↓
 LoopRuntimeKernel
      ↓
 State Machine
```

`submit` 不接受目标状态。Runtime 根据当前 State、StageRegistry、Facts、Evidence、Policy 和 Completion Gate 决定是否以及如何推进状态；失败时返回 `[LOOP_BLOCKED]`。

`approve` 也不直接写 State。人工审批必须先经过 `HumanApprovalGate`，然后由 Kernel 执行受 Guard 约束的迁移。

如果宿主无法调用 Agent-facing CLI Adapter，`/loop` 不得退化为“凭 Skill 文案自觉遵守状态机”的模式；应直接阻断并报告 Runtime Adapter 未配置。

## 项目 Loop 工作区

每个项目只需要一个根目录 `.loop/`。`.loop/` 是该项目所有 Loop 配置与运行产物的统一工作区。一个 Project 可以存在多个 Run；Run 不通过项目级互斥锁串行化。

不同项目各自使用项目根目录下的 `.loop`，运行产物不得跨项目共享。目录不存在时由 Project Workspace Initializer 创建；初始化必须先于 Run 创建。

## Runtime Adapter 总体边界

```text
/loop                     CLI                    Scheduler
  ↓                        ↓                         ↓
Skill Adapter          CLI Adapter          Scheduler Adapter
  └──────────────────────────┬──────────────────────┘
                             ↓
                         RunService
                             ↓
                         Loop Runtime
                             ↑
                      Event Observer
                         ↗       ↖
                       UI        CLI
```

所有 Adapter 都只能表达入口意图；Runtime 才是生命周期、状态、权限、审批和安全边界的唯一权威。

## 配置与运行时边界

- `.loop/README.md`：项目 Loop 工作区说明，由初始化器创建；已有文件不得被初始化器覆盖。
- `.loop/config.yaml`：项目 Trust、Permission、项目级 Policy，唯一真实配置来源。
- `.loop/runtime/runs/<run-id>/state.yaml`：每个 Run 独立的 Runtime State。
- `.loop/runtime/history.jsonl`：跨 Run 的 append-only 审计事实，每条事件必须携带 Run ID。
- `.loop/runtime/locks/`：资源级并发控制，不存在项目级 `run.lock`。
- `loop/config.yaml`：引擎能力、固定工作流、默认限制和 Trust 等级语义。
- `loop/schemas/`：State、Policy、Policy Snapshot、Evidence、Artifact 契约。
- `loop/runtime/project-workspace.ts`：项目 `.loop/` 初始化/恢复边界。
- `loop/runtime/project-runtime-workspace.ts`：把同一个 Project Workspace 注入 State、Artifact、Audit、Mutation Journal 和 Checkpoint 持久化组件。
- `loop/runtime/enforcement.ts`：Runtime Enforcement 原语。
- `loop/runtime/resource-policy.ts`：资源可修改性与 Capability 授权规则。
- `loop/runtime/lock.ts`：资源级互斥锁。
- `loop/runtime/kernel.ts`：Runtime Enforcement 集成边界；实际 Capability Executor、Resource Mutation 和 StateStore 必须通过 Kernel。
- `loop/runtime/persistence.ts`：文件持久化边界；State 原子写入、Schema 校验、崩溃恢复，以及 `history.jsonl` append-only 审计。

## 核心权限模型

Loop 必须严格区分四个问题：

```text
Resource Policy
    ↓
这个资源允许修改吗？
    ↓
Capability
    ↓
当前 Run 是否拥有该资源的修改能力？
    ↓
Approval
    ↓
是否满足当前动作的用户授权要求？
    ↓
Resource Lock
    ↓
现在是否有其他 Run 正在修改同一资源？
    ↓
Mutation
```

## Human Approval Gate

Human Gate 是 Runtime 权威边界，不是 Skill、CLI 或 Scheduler 自己维护的一套状态。

当前有两个 Run 级 Gate：

- `execution`：Run 位于 `WAITING_FOR_GOAL_CONFIRMATION` 时使用。
- `final`：Run 位于 `READY_FOR_CONFIRMATION` 时使用。

审批必须经过 `HumanApprovalGate`：

```text
/loop / CLI / Scheduler
          ↓
   Human Approval Adapter
          ↓
   HumanApprovalGate
          ↓
   Policy Revision + Run State 校验
          ↓
   Runtime Facts + APPROVAL_RESOLVED
```

## Lifecycle

```text
INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE
```

失败修复：

```text
VERIFY / REVIEW / READY_FOR_CONFIRMATION → FIX → IMPLEMENT
```

需要人工等待或外部依赖时进入 `PAUSED`；安全阻断进入 `BLOCKED`。

## VERIFY / REVIEW / DONE

VERIFY 必须执行项目原生验证并生成 Evidence；Review 必须检查 Acceptance Criteria、Evidence、规则、Diff 和回归风险。

`DONE` 要求 Acceptance、Verification、Review 和适用 Final Approval 全部满足。Agent 自己声称完成不能作为 Evidence。

## Git / Safety / Cancellation

INIT 记录 baseline branch 和 commit；完成前检查相对 baseline 的 Diff。默认不自动 Commit 或 Push。用户明确取消时立即停止当前运行，并保留取消事实和未完成状态。
