# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态机、项目 Policy、Permission、Trust、Approval、安全边界、Resource Governance 和 Evidence。

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

## `.loop/` 工作区

每个项目只有一个 `.loop/` 根目录，统一承载项目配置和所有 Run 的运行产物：

```text
.loop/
├── config.yaml
├── runtime/
│   ├── runs/<run-id>/
│   │   ├── state.yaml
│   │   ├── mutation-journal.jsonl
│   │   └── replay-report.json
│   ├── history.jsonl
│   └── locks/<resource>.lock
├── plans/<run-id>.md
├── specs/<run-id>/<spec-id>.pecs.md
├── evidence/<run-id>/<evidence-id>.yaml
└── reviews/<run-id>.md
```

`.loop/runtime/history.jsonl` 是 Runtime Audit 的权威事实源；Scheduler 和 Observer 都不直接修改它。

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
