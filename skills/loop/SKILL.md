---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety 和 Evidence。

## 项目配置唯一入口

每个项目只需要一个根目录 `.loop` **文件**。

```text
<project-root>
├── .loop
└── ...
```

`.loop` 是文件，不是目录。Loop 不要求项目额外创建固定的状态文件或 Evidence 目录。

项目配置模型：

```text
.loop
 ├── trust
 ├── permissions
 └── project policy
       ↓
Policy Resolver
       ↓
Effective Policy
       ↓
Loop Runtime
```

## 职责边界

- `.loop`：项目 Trust、Permission、项目级 Policy 的唯一来源。
- `loop/config.yaml`：引擎能力、固定工作流、默认限制和 Trust 等级语义。
- `loop/policies/default.yaml`：引擎默认策略。
- `loop/schemas/state.yaml`：Runtime 状态和合法转移。
- `loop/schemas/evidence.yaml`：Evidence 数据模型。
- Runtime：一次运行的状态和历史事实。

Runtime 的实际存储由宿主运行时负责，不把 Runtime 文件结构强加给项目。

## Trigger

Loop 只能由显式 `/loop` 调用启动或恢复。普通对话不得隐式启动、恢复或授权 Loop 修改仓库。

## Trust

Trust 是**项目属性**，不是 Runtime 属性，也不是 Agent 自己可以提升的权限。

项目当前 Trust 的唯一真实来源：

```text
<project-root>/.loop
```

最小配置：

```yaml
# 项目级 Loop 配置。
version: 1

# 当前项目对 Agent 的信任等级。
trust: low

permissions:
  approval:
    # 跟随项目 Trust 的执行前审批策略。
    beforeExecution: inherit
    # 跟随项目 Trust 的完成前审批策略。
    beforeFinalize: inherit
```

引擎 Trust 语义：

| Trust | Before execution | Before finalize |
|---|---|---|
| `low` | required | required |
| `medium` | automatic | required |
| `high` | automatic | automatic |
| `full` | automatic | automatic |

Trust 只能影响 Trust-controlled Approval Gate 的默认人工参与程度。

Trust 不能：

- 将 Capability `deny` 变成 `allow`。
- 绕过高风险操作的独立安全策略。
- 绕过 Secret / Production 等硬性安全边界。
- 修改 Loop 安全限制。

## Permission

Permission 决定 Agent **能不能做**；Trust 决定允许之后**默认是否需要人工审批**。

```text
Trust → Approval default
Permission → Capability decision
Security Policy → Hard safety boundary
State Machine → Lifecycle decision
```

显式 `deny` 永远优先。

## Policy Resolution

启动、恢复以及进入 Trust-controlled Gate 前，都必须重新解析当前项目策略：

```text
.loop
 ↓
Project Policy
 ↓
Engine Default
 ↓
Trust Resolution
 ↓
Effective Policy
 ↓
Current Gate
```

`inherit` 表示对应审批策略跟随当前项目 Trust。

如果配置冲突、缺失或无法安全解析，必须进入 `BLOCKED`，不得猜测。

## Runtime Contract

Runtime 只记录一次运行的事实：

- run ID
- state / phase
- iteration / fix counters
- project context
- request / acceptance criteria
- plan
- verification
- review
- approval history
- evidence references
- Git baseline

Runtime **不得保存项目 Trust 或 Permission 的第二份配置**。

Approval History 可以记录 Gate、时间、决策、来源和策略摘要，但这些都是历史事实，不是项目配置。

## Trust Change

用户修改项目 `.loop` 后：

1. 尚未决策的 Trust-controlled Gate 必须在决策前重新读取 `.loop`。
2. 后续 Gate 使用新的 Effective Policy。
3. 已完成的 Approval Event 不被倒推修改。
4. 如果 Runtime 与当前项目配置无法安全对应，进入 `BLOCKED`。

## Lifecycle

固定生命周期：

```text
INIT
  ↓
GOAL_REVIEW
  ↓
WAITING_FOR_GOAL_CONFIRMATION
  ↓
PLAN
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
REVIEW
  ↓
READY_FOR_CONFIRMATION
  ↓
DONE
```

失败修复：

```text
VERIFY / REVIEW / READY_FOR_CONFIRMATION
                  ↓
                 FIX
                  ↓
              IMPLEMENT
```

只能执行 `loop/schemas/state.yaml` 定义的合法转移。

## INIT

1. 定位项目根目录。
2. 加载 `AGENTS.md` 和相关 Skills。
3. 读取唯一 `.loop`。
4. 加载或创建 Runtime。
5. 捕获 Git branch 和 baseline commit。
6. 解析当前 Project Policy、Trust 和 Permission。
7. 无法安全解析时进入 `BLOCKED`。

## GOAL_REVIEW

形成：

- Goal
- Acceptance Criteria
- Verification Strategy
- High-level Plan

完成后进入执行前 Gate。

## WAITING_FOR_GOAL_CONFIRMATION

进入 Gate 前重新解析 `.loop`：

- `required`：等待用户确认，禁止进入 IMPLEMENT。
- `automatic`：自动通过。
- `deny` / invalid：`BLOCKED`。

## PLAN

根据已确定 Goal、项目规则和 Skills 形成可执行计划。

## IMPLEMENT

只执行当前任务，并遵守 Project Permission、Safety Policy 和项目规则。

## VERIFY

执行适用的项目原生验证。Verification 不得省略。

记录 Verification 结果和 Evidence 引用。

- pass → `REVIEW`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

## REVIEW

检查 Acceptance Criteria、Evidence、项目规则、实现质量、范围、回归风险和 Git Diff。

- pass → `READY_FOR_CONFIRMATION`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

## READY_FOR_CONFIRMATION

进入 Final Gate 前重新解析 `.loop`：

- `required`：等待用户接受最终结果。
- `automatic`：满足其他完成条件后自动通过。
- 用户拒绝：`FIX`。
- unsafe / denied：`BLOCKED`。

## DONE / BLOCKED

`DONE` 要求所有验收标准、Verification、Review 和适用 Final Approval Policy 满足。

`BLOCKED` 表示当前运行无法安全继续，必须记录阻断原因。

## Resume

恢复时：

1. 读取 Runtime 状态。
2. 校验 State Schema。
3. 确认项目根目录和 Git 上下文。
4. 读取唯一 `.loop`。
5. 重新解析当前 Trust、Permission 和 Effective Policy。
6. 从持久化 Runtime 状态继续。
7. 不使用聊天历史猜测状态。
8. 无法安全对应时进入 `BLOCKED`。

## Evidence

Evidence 用于证明 Acceptance Criteria、Verification 和 Review 结果。

```text
Acceptance Criteria
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion Decision
```

Agent 自己声称完成不能作为 Evidence。

## Git Contract

INIT 记录 baseline branch 和 commit；完成前检查相对 baseline 的 Diff。

默认不自动 Commit 或 Push。Git Capability Permission 与 Trust 独立。

## Safety

Trust 只能影响 Trust-controlled Approval Gate，不能绕过 Capability deny、dangerous-operation policy、Secret / Production protection 或 Loop safety limits。

## Cancellation

用户明确取消时立即停止当前运行，并由 Runtime 保留取消事实和未完成状态。不得继续执行。
