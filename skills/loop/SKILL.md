---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety、Resource Governance 和 Evidence。

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
当前 Run 是否拥有修改该资源的能力？
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

### Resource Policy

资源分为：

- `readonly`：只能读取，任何 Mutation 都拒绝。
- `mutable`：允许修改，但必须命中明确的 `allowedCapabilities`。
- `protected`：默认禁止修改；只有明确授权的特权 Capability 可以修改。

Lock **不负责决定资源能不能修改**。Resource Policy 才是“可修改性”的事实来源。

默认资源策略包括：

- `working-tree`：`mutable`，允许代码、测试和普通产物修改。
- `.loop/config.yaml`：`protected`，仅 `loop.policy.modify` 可修改。
- `.loop/policies`：`protected`，仅 `loop.policy.modify` 可修改。
- `.loop/schemas`：`protected`，仅 `loop.schema.modify` 可修改。
- `.git`：`readonly`，禁止直接 Mutation。

### Resource Lock

Resource Lock 只解决并发问题：

```text
Run A → working-tree/src-a.lock → MODIFY
Run B → working-tree/src-b.lock → MODIFY
Run C → working-tree/src-a.lock → BLOCKED / WAIT
```

因此多个 Run 可以同时进行分析、Plan、Review，甚至修改互不冲突的资源；只有同一资源的竞争修改需要互斥。

禁止重新引入 `.loop/runtime/run.lock` 这种 Project 级 Run Mutex。

### Run ID

Run ID 是独立执行上下文的稳定身份，用于：

- 绑定独立 Runtime State。
- 绑定 Plan / Spec / Evidence / Review 产物。
- 绑定 Policy Snapshot 与 Approval Event。
- 作为 Resource Lock 的 owner。
- 在 Audit Log 中追踪完整生命周期。

Run ID 不是项目锁的持有人 ID。

## Runtime Enforcement

所有 Capability 执行、Resource Mutation 和 State Transition 都必须先经过 `LoopRuntimeKernel`。

### Capability

执行 Capability 前必须提供：Run ID、Policy Snapshot、Snapshot Revision、当前 Policy Revision、Capability Decision 和 Approval Decision。

强制执行链：

```text
Kernel.executeCapability()
       ↓
Run / Snapshot 校验
       ↓
Policy Revision Match
       ↓
Capability Decision
       ↓
Security / Dangerous Check
       ↓
Approval Decision
       ↓
ALLOW → CapabilityExecutor.execute()
CONFIRM → ApprovalProvider → 记录 Approval Event → 重新校验 Revision → Executor
DENY / BLOCKED → 不调用 Executor + 记录 BLOCKED Event
```

### Resource Mutation

实际修改资源必须走：

```text
Kernel.mutateResource()
       ↓
Resource Policy
       ↓
Capability allowed?
       ↓
Resource Lock
       ↓
Mutation Executor
       ↓
Release Lock
```

强制规则：

- `readonly` 永远不能 Mutation。
- `mutable` 只有声明过的 Capability 可以 Mutation。
- `protected` 只有显式特权 Capability 可以 Mutation。
- Mutation 没有 Resource Lock 时必须 `BLOCKED`。
- Lock owner 必须是当前 Run；其他 Run 不得释放或冒用。
- Lock 存在且无法确认所有权时必须保持阻断，不得猜测或强制抢占。
- Resource Policy 与 Resource Lock 不得互相替代。

## State Transition

State 更新不得直接写入 `status`。必须调用 `LoopRuntimeKernel.transition()`，由 Kernel 先验证 Revision、允许拓扑和对应 Transition Guards，再写入当前 Run 的 StateStore。

```text
Current Run State
    ↓
Kernel.transition()
    ↓
Policy Revision Match
    ↓
Allowed Transition
    ↓
Transition Guard
    ↓
Atomic StateStore.write()
    ↓
STATE_TRANSITION Audit Event
```

P1.5 Runtime 至少强制：

- `WAITING_FOR_GOAL_CONFIRMATION → PLAN`：执行前 Approval + Revision Match。
- `PLAN → IMPLEMENT`：Plan Artifact 存在。
- `IMPLEMENT → VERIFY`：Implementation Completed。
- `VERIFY → REVIEW`：Verification Passed。
- `VERIFY → FIX`：Verification Failed。
- `REVIEW → READY_FOR_CONFIRMATION`：Review Passed。
- `REVIEW → FIX`：Review Failed。
- `READY_FOR_CONFIRMATION → DONE`：Acceptance、Verification、Review 和 Final Approval 全部满足，并且 Revision Match。
- `FIX → IMPLEMENT`：Fix 次数未超过限制。
- `PAUSED` 只能通过合法 Resume Transition 恢复。
- `BLOCKED` 不允许原地 Resume。

## Persistent State / Crash Recovery

- 每个 Run 的唯一 Runtime State 应位于 `.loop/runtime/runs/<run-id>/state.yaml`。
- State 文件必须包含 `schemaVersion`；未知版本必须 `BLOCKED`，不能猜测兼容。
- State 写入必须采用临时文件 + atomic rename，禁止直接覆盖生产 State。
- `.loop/runtime/history.jsonl` 是跨 Run 的 append-only Runtime Audit Log；历史事件不得通过重写 State 伪造。
- Approval、State Transition 和 BLOCKED 事实必须带唯一 Event ID、Run ID、时间和 Policy Revision。
- `.loop/` 下的持久化文件不是 Agent 的第二套权限配置；Policy 真相仍只有项目 `.loop/config.yaml`。

## PAUSED / BLOCKED

- `PAUSED` 是可恢复等待态；恢复必须由 Runtime 校验原状态、Snapshot / Policy Revision 和产物完整性。
- `BLOCKED` 是安全终止态；不得原地 Resume。
- Policy Revision mismatch、无法解析 Policy、非法 Transition、资源权限拒绝或资源锁冲突都不得伪装成成功。

## Policy Revision

Policy Revision 必须是正整数，并且策略发生变更时只能递增。Runtime 不接受相同或更低 Revision 作为更新结果。

Policy Snapshot 在 Run 创建后视为只读。项目策略发生变化时，必须重新解析并生成新的 Snapshot；已经发生的 Approval Event 不会被旧配置倒推修改。

## Trust / Permission / Approval

Trust 是项目属性，不是 Runtime 属性，也不是 Agent 自己可以提升的权限。

Permission 决定 Capability 能否执行；Trust 只影响 Trust-controlled Approval Gate 的默认人工参与程度。

Capability Decision：

```text
deny    → 终止
allow   → 进入 Gate
confirm → 必须进入 Approval
```

显式 `deny` 永远优先；Trust 不能绕过高风险、Secret、Production 或 Loop safety limits。

## Lifecycle

```text
INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE
```

失败修复：

```text
VERIFY / REVIEW / READY_FOR_CONFIRMATION → FIX → IMPLEMENT
```

需要人工等待或外部依赖时进入 `PAUSED`；安全阻断进入 `BLOCKED`。

## P2-6 / P2-7 Runtime Adapter

CLI 是 Runtime Adapter，不是 Runtime 本身。Adapter 只能调用 Runtime API，不能复制 State Machine、Policy、Permission、Trust、Approval、Lock、Mutation 或 Evidence 逻辑。

P2-6 当前开放：

```bash
loop replay <run-id>
loop replay <run-id> --json
```

P2-7 新增：

```bash
loop run
loop resume <run-id>
```

`loop run` 必须调用 `RunRuntime.createRun()`，再交给 `ExecutionRuntime.runUntilHalt()`；`loop resume` 必须调用 `RunRuntime.resume()`，从持久化 `facts.pausedFromStatus` 获取恢复目标，并通过 `LoopRuntimeKernel.transition()` 重新进入 State Machine。

```text
CLI
 ↓
RunService
 ├── RunRuntime.createRun()
 │       ↓
 │   Runtime State + Policy Snapshot + Git Baseline
 └── ExecutionRuntime.runUntilHalt()

CLI
 ↓
RunService.resume(run-id)
 ↓
RunRuntime.resume()
 ↓
Kernel.transition(persisted pausedFromStatus)
 ↓
ExecutionRuntime.runUntilHalt()
```

`pausedFromStatus` 必须持久化在 Run State 中。禁止根据 `facts` 猜测恢复位置，也禁止使用聊天历史恢复 Runtime。

P2-7 的 Adapter 错误必须保持非零：缺少 run-id、非法参数、Runtime Blocked、Policy Revision mismatch、缺少恢复目标或状态损坏均不能转换成成功。

## INIT / Resume

INIT：定位项目根目录 → 加载规则 → 读取 `.loop/config.yaml` → 创建 Run ID → 创建该 Run 的 Runtime State → 捕获 Git baseline → 解析 Policy → 生成 Snapshot / Revision → 原子持久化初始 State。

Resume：读取对应 Run 的持久化 State → 必须先通过 Schema / Snapshot / Run ID 校验 → 校验项目和 Git 上下文 → 重新解析当前 Policy → 比较 Revision → Revision mismatch 则 `BLOCKED` → 校验该 Run 的 Plan / Spec / Evidence / Review → 从持久化 `pausedFromStatus` 恢复原状态 → 通过 Kernel Transition Guard 继续执行。

不得依赖聊天历史猜测 Runtime 状态。

## VERIFY / REVIEW / DONE

VERIFY 必须执行项目原生验证并生成 Evidence；Review 必须检查 Acceptance Criteria、Evidence、规则、Diff 和回归风险。

`DONE` 要求 Acceptance、Verification、Review 和适用 Final Approval 全部满足。Agent 自己声称完成不能作为 Evidence。

## Git / Safety / Cancellation

INIT 记录 baseline branch 和 commit；完成前检查相对 baseline 的 Diff。默认不自动 Commit 或 Push。用户明确取消时立即停止当前运行，并保留取消事实和未完成状态。
