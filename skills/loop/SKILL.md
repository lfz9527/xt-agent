---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety 和 Evidence。

## 项目 Loop 工作区

每个项目只需要一个根目录 `.loop/` 目录。`.loop/` 是该项目所有 Loop 配置与运行产物的统一工作区。

```text
<project-root>
├── .loop/
│   ├── config.yaml
│   ├── runtime/
│   │   ├── state.yaml
│   │   ├── history.jsonl
│   │   └── policy-snapshot.yaml
│   ├── plans/<run-id>.md
│   ├── specs/<run-id>/<spec-id>.pecs.md
│   ├── evidence/<run-id>/<evidence-id>.yaml
│   └── reviews/<run-id>.md
└── ...
```

不同项目各自使用项目根目录下的 `.loop/`，运行产物不得跨项目共享。目录不存在时由 Runtime 按需创建。

## 配置与运行时边界

- `.loop/config.yaml`：项目 Trust、Permission、项目级 Policy，唯一真实配置来源。
- `.loop/runtime/`：Runtime 状态、历史和 Policy Snapshot。
- `loop/config.yaml`：引擎能力、固定工作流、默认限制和 Trust 等级语义。
- `loop/schemas/`：State、Policy、Policy Snapshot、Evidence、Artifact 契约。
- `loop/runtime/enforcement.ts`：Runtime Enforcement 原语。
- `loop/runtime/kernel.ts`：Runtime Enforcement 集成边界；实际 Capability Executor 和 StateStore 必须通过 Kernel。
- `loop/runtime/persistence.ts`：文件持久化边界；`state.yaml` 原子写入、Schema 校验、崩溃恢复，以及 `history.jsonl` append-only 审计。

```text
.loop/config.yaml
       ↓
Project Policy
       ↓
Engine Default
       ↓
Trust Resolution
       ↓
Effective Policy
       ↓
Policy Snapshot + Revision
       ↓
Runtime Kernel
       ├── Capability Enforcement → Approval → Capability Executor
       └── Transition Enforcement → Atomic StateStore → Audit Log
```

## Trigger

Loop 只能由显式 `/loop` 调用启动或恢复。普通对话不得隐式启动、恢复或授权 Loop 修改仓库。

## Runtime Enforcement

Runtime Enforcement 是实际执行边界，不是文档约定。所有 Capability 执行和 State Transition 都必须先经过 `LoopRuntimeKernel`。

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

强制规则：

- Snapshot 必须属于当前 Run。
- Snapshot Revision、Runtime Revision、当前项目 Revision 必须一致。
- Revision mismatch 必须 `BLOCKED`。
- `deny` 永远不能被 Approval、Trust 或 Agent 意图覆盖。
- `confirm` 不能直接执行；只有 `approved` 或 `automatic` 才能继续。
- Approval 请求与结果必须进入 append-only `history.jsonl`，并带唯一 Event ID、Run ID 和 Policy Revision。
- Approval 完成后必须再次读取当前 Policy Revision，再进入 Executor。
- 高风险 Capability 没有显式 `confirm` 安全路径时不得执行。
- Capability Executor 不得自行绕过 Kernel 调用底层能力。

### State Transition

State 更新不得直接写入 `status`。必须调用 `LoopRuntimeKernel.transition()`，由 Kernel 先验证 Revision、允许拓扑和对应 Transition Guards，再写入 StateStore。

```text
Current State
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

### Persistent State / Crash Recovery

- Runtime State 的唯一持久化事实是项目 `.loop/runtime/state.yaml`。
- State 文件必须包含 `schemaVersion`；未知版本必须 `BLOCKED`，不能猜测兼容。
- State 写入必须采用临时文件 + atomic rename，禁止直接覆盖生产 State。
- 进程在 rename 前崩溃时，Runtime 可以恢复完整临时 State；不完整或无法解析的 State 必须 `BLOCKED`。
- State 的 `runId`、`policyRevision` 与 Policy Snapshot 必须一致，否则 `BLOCKED`。
- `.loop/runtime/history.jsonl` 是 append-only Runtime Audit Log；历史事件不得通过重写 State 伪造。
- Approval、State Transition 和 BLOCKED 事实必须带唯一 Event ID、Run ID、时间和 Policy Revision。
- `.loop/` 下的持久化文件不是 Agent 的第二套权限配置；Policy 真相仍只有项目 `.loop/config.yaml`。

### PAUSED / BLOCKED

- `PAUSED` 是可恢复等待态；恢复必须由 Runtime 校验原状态、Snapshot / Policy Revision 和产物完整性。
- `BLOCKED` 是安全终止态；不得原地 Resume。
- Policy Revision mismatch、无法解析 Policy、非法 Transition 或安全拒绝都不得降级成 `PAUSED`。

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

## INIT / Resume

INIT：定位项目根目录 → 加载规则 → 读取 `.loop/config.yaml` → 创建 Runtime → 捕获 Git baseline → 解析 Policy → 生成 Snapshot / Revision → 原子持久化初始 State。

Resume：读取持久化 State → 必须先通过 Schema / Snapshot / Run ID 校验 → 校验项目和 Git 上下文 → 重新解析当前 Policy → 比较 Revision → Revision mismatch 则 `BLOCKED` → 校验 run-id 对应的 Plan / Spec / Evidence / Review → 通过 Transition Guard 恢复。

不得依赖聊天历史猜测 Runtime 状态。

## VERIFY / REVIEW / DONE

VERIFY 必须执行项目原生验证并生成 Evidence；Review 必须检查 Acceptance Criteria、Evidence、规则、Diff 和回归风险。

`DONE` 要求 Acceptance、Verification、Review 和适用 Final Approval 全部满足。Agent 自己声称完成不能作为 Evidence。

## Git / Safety / Cancellation

INIT 记录 baseline branch 和 commit；完成前检查相对 baseline 的 Diff。默认不自动 Commit 或 Push。用户明确取消时立即停止当前运行，并保留取消事实和未完成状态。
