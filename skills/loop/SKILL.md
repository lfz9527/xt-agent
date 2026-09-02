---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety、Resource Governance 和 Evidence。

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

## 项目 Loop 工作区

每个项目只需要一个根目录 `.loop/`。`.loop/` 是该项目所有 Loop 配置与运行产物的统一工作区。一个 Project 可以存在多个 Run；Run 不再通过项目级互斥锁串行化。

```text
<project-root>
├── .loop/
│   ├── config.yaml
│   ├── runtime/
│   │   ├── runs/<run-id>/state.yaml
│   │   ├── history.jsonl
│   │   └── locks/<resource>.lock
│   ├── plans/<run-id>.md
│   ├── specs/<run-id>/<spec-id>.pecs.md
│   ├── evidence/<run-id>/<evidence-id>.yaml
│   └── reviews/<run-id>.md
└── ...
```

不同项目各自使用项目根目录下的 `.loop/`，运行产物不得跨项目共享。目录不存在时由 Runtime 按需创建。

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
```

所有 Adapter 都只能表达入口意图；Runtime 才是生命周期、状态、权限、审批和安全边界的唯一权威。

## 配置与运行时边界

- `.loop/config.yaml`：项目 Trust、Permission、项目级 Policy，唯一真实配置来源。
- `.loop/runtime/runs/<run-id>/state.yaml`：每个 Run 独立的 Runtime State。
- `.loop/runtime/history.jsonl`：跨 Run 的 append-only 审计事实，每条事件必须携带 Run ID。
- `.loop/runtime/locks/`：资源级并发控制，不存在项目级 `run.lock`。
- `loop/config.yaml`：引擎能力、固定工作流、默认限制和 Trust 等级语义。
- `loop/schemas/`：State、Policy、Policy Snapshot、Evidence、Artifact 契约。
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
