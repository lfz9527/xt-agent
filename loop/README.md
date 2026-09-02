# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态机、项目 Policy、Permission、Trust、Approval、安全边界、Resource Governance 和 Evidence。

## Project Loop Workspace 初始化

每次通过 `/loop` 启动新的 Loop Run 时，入口首先解析 Project Root，并通过 `ProjectLoopWorkspaceInitializer` 确保项目根目录存在完整的 `.loop/` 工作区，然后才允许创建 Run。

初始化是幂等的：

- `.loop/` 不存在：创建完整工作区。
- `.loop/` 已存在：补齐缺失的标准目录和初始化文件。
- 已存在的 `config.yaml`、Runtime State、Audit History 和业务产物绝不覆盖。
- Git 项目优先使用 repository root；非 Git 项目使用当前工作目录。
- Skill 不自行实现文件初始化，初始化责任属于 Runtime。

```text
/loop
  ↓
Resolve Project Root
  ↓
ProjectLoopWorkspaceInitializer.ensure()
  ↓
Create / Restore <project-root>/.loop/
  ↓
RunService.run()
  ↓
RunRuntime.createRun()
  ↓
Loop Lifecycle
```

标准项目工作区：

```text
<project-root>/.loop/
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

`.loop/` 是项目级唯一 Loop 工作区。不同项目之间不得共享 Loop 产物。

## P2-11 Run Event / Observer API

P2-11 为外部 UI、CLI、Scheduler 和其他只读消费者提供统一的 Run Event 观察边界。

```text
Runtime Timeline
       ↓
Run Event Observer
   ↙       ↓       ↘
 UI       CLI    Scheduler
```

Observer 支持两类能力：

- `list(runId)`：通过 Runtime Audit Replay 查询已经持久化的历史事件。
- `subscribe(runId, observer)`：订阅当前 Runtime Timeline 中的新事件，并返回取消订阅函数。

Observer 只读：不得直接读取/修改 `state.yaml`，不得调用 State Machine、Policy、Permission、Trust、Approval 或 Evidence 决策，也不拥有 Runtime State。所有事件仍由 Runtime Audit / Unified Audit Timeline 产生。

当前观察范围与 Unified Audit Timeline 保持一致：`STAGE`、`CHECKPOINT`、`EVIDENCE`、`RESOURCE_MUTATION`、`STATE_TRANSITION`。Observer 不创建新的事实源，也不复制一套状态机。

## P2-10 Scheduler Adapter

Scheduler 只是 Loop Runtime 的“时间入口”，不拥有 Runtime 生命周期。

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

`SchedulerRuntimeAdapter` 负责注册一次性或固定间隔任务、校验 Job ID 与时间参数、防止重复注册、取消任务，并在触发时调用共享 `RunService.run()`。

Scheduler 不得创建或修改 `.loop/runtime`、实现 State Machine、Policy、Permission、Trust、Approval 或 Evidence，也不得自行判断 Run 是否允许执行。重复触发和 Runtime 是否可执行由 `RunService` / Loop Runtime 决定。

当前 P2-10 只定义 Adapter Boundary，不绑定 cron parser、OS daemon 或桌面调度器；这些都可以作为外部 Scheduler 接入同一 Adapter。

## P2-12 Loop v1 Hardening

P2-12 不增加新的状态机，而是把已有 Runtime 边界收紧到可以长期运行的程度。

### Persistence

- `runId` 在 State、Checkpoint、Mutation Journal、Audit Replay 等文件边界统一执行安全校验，禁止路径穿越。
- State / Checkpoint 使用唯一临时文件后再 `rename`，避免固定 `.tmp` 文件被并发写入互相覆盖。
- 崩溃恢复会识别遗留临时文件；存在多个临时文件时只恢复最新候选并清理旧候选。
- Mutation Journal 的写入必须与其 Run 存储边界一致，禁止跨 Run 写入。
- `.loop/runtime/history.jsonl` 仍是 Runtime Audit 的唯一事实源；Replay Report 只是派生结果。

### Observer

- `unsubscribe()` 必须真正停止后续事件投递。
- Observer callback 是非关键消费方；callback 抛错不能阻断 Audit Timeline、Runtime State 或主执行流程。
- Observer 只能消费 Runtime Event，不能修改 Runtime State，也不能成为新的事实源。

### Scheduler

- 同一 interval Job 使用 single-flight：上一次 `RunService.run()` 未结束时，后续 tick 不会重入启动新的 Run。
- Run 成功或失败后都释放该 Job 的执行占用，下一次 tick 可以继续。
- 该机制只约束 Scheduler Job 自身，不复制 Runtime 的 State Machine、Lock、Policy 或 Approval。

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
