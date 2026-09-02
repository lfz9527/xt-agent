---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start Loop, modify files, or continue a Loop run from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作，Loop 负责生命周期、状态机、Permission、Trust、Approval、Safety 和 Evidence。

## 项目配置边界

每个项目只需要一个根目录 `.loop` **文件**。它是该项目 Trust、Permission 和项目级 Loop Policy 的唯一配置入口。

```text
Project
  └── .loop
       ├── trust
       ├── permissions
       └── project policy
              ↓
       Permission Resolver
              ↓
       Effective Policy
              ↓
         Loop Runtime
```

`loop/config.yaml` 是引擎默认配置，不保存项目当前 Trust。
`loop/policies/default.yaml` 是引擎默认策略。
`loop/schemas/state.yaml` 描述一次 Runtime。
`loop/schemas/evidence.yaml` 描述 Evidence。

`.loop-state.yaml` 和 `.loop-evidence/` 如果启用，只是 Runtime 生成的数据，绝不是项目 Trust 或 Permission 的第二来源。

## Trigger

Loop 只能由显式 `/loop` 调用启动或恢复。普通对话不得隐式启动、恢复或授权 Loop 修改仓库。

## Trust Level

Trust 是**项目属性**，不是 Loop Runtime 属性，也不是 Agent 自己可以提升的权限。

项目当前 Trust 的唯一真实来源：

```text
<project-root>/.loop
```

示例：

```yaml
# 项目级 Loop 配置。
version: 1

# Trust 属于项目。
trust: low

permissions:
  approval:
    # 跟随项目 Trust。
    beforeExecution: inherit
    beforeFinalize: inherit
```

引擎定义 Trust 等级的通用语义：

| Trust | Before execution | Before finalize |
|---|---|---|
| `low` | required | required |
| `medium` | automatic | required |
| `high` | automatic | automatic |
| `full` | automatic | automatic |

不得在 Runtime 中创建 `permission.trust.level` 或其他第二份 Trust 配置。

## Trust 与 Permission

两者职责必须分离：

```text
Trust
  ↓ 默认 Approval 行为
Permission
  ↓ Capability 是否允许
Approval
  ↓ 当前 Gate 是否需要人工参与
State Machine
  ↓ 当前生命周期阶段
```

项目 `.loop` 可以显式收紧 Permission：

```yaml
permissions:
  filesystem:
    read: allow
    write: allow
  shell:
    execute: allow
    dangerous: confirm
  git:
    read: allow
    commit: confirm
    push: confirm
  network:
    request: confirm
```

显式 `deny` 永远优先。Trust 不能把 denied capability 变成 allowed。

Trust 也不能绕过 dangerous / high-risk 操作、Secret、Production 等硬性安全边界。

## Policy Resolution

任何 Trust-controlled Gate 都必须按当前项目配置重新解析：

```text
项目 `.loop`
   ↓
Trust
   ↓
Project Permission
   ↓
Engine Default
   ↓
Effective Policy
   ↓
Current Gate
```

`inherit` 表示对应 Permission 跟随项目 Trust。

如果配置无效、Permission 冲突或无法安全确定最终策略，进入 `BLOCKED`，不得猜测。

## Runtime

Runtime 只记录一次 Loop 的执行事实：

- run identity
- state / phase
- iteration / fix counters
- project context
- request
- plan
- verification
- review
- approval history

Runtime 不拥有 Trust。

Approval History 可以记录 Gate、时间、结果、来源以及必要的策略版本/配置摘要，但它只是历史事实，不是 Trust 配置。

## Trust Change

用户修改项目 `.loop` 中的 Trust 后，未来 Gate 使用新的项目策略。

已经完成的 Approval Event 不会被倒推撤销。

对于尚未做出决策的 Gate，在真正执行决策前必须重新读取 `.loop` 并解析当前策略，避免使用过期配置。

## INIT

1. 定位项目根目录。
2. 加载 `AGENTS.md` 和相关 Skills。
3. 读取项目根目录唯一 `.loop`。
4. 加载 Runtime 状态；存在活动 Run 时恢复。
5. 捕获 Git branch 和 baseline commit。
6. 校验项目 Trust / Permission。
7. 创建或恢复 Runtime。

Transition：`INIT → GOAL_REVIEW` 或 `BLOCKED`。

## GOAL_REVIEW

定义：

- Goal
- Acceptance Criteria
- verification strategy
- high-level plan

Transition：`GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION` 或 `BLOCKED`。

## WAITING_FOR_GOAL_CONFIRMATION

进入 Gate 前重新解析项目 `.loop` 的 `beforeExecution`：

- `required`：等待用户确认，禁止修改实现文件。
- `automatic`：自动通过。
- denied / invalid：`BLOCKED`。

Transition：`WAITING_FOR_GOAL_CONFIRMATION → PLAN` 或 `BLOCKED`。

## PLAN

根据已确认 Goal、项目规则和 Skills 形成可执行任务与验证方案。

Transition：`PLAN → IMPLEMENT` 或 `BLOCKED`。

## IMPLEMENT

只执行当前任务，遵守项目 Permission 和 Test First 等项目规则。

Transition：`IMPLEMENT → VERIFY` 或 `BLOCKED`。

## VERIFY

执行适用的项目原生验证。测试可以在不适用时省略，但 Verification 本身不能省略。

记录 Evidence，并保留失败结果供 FIX 使用。

Transition：

- pass → `REVIEW`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

## REVIEW

检查 Acceptance Criteria、Evidence、项目规则、实现质量、范围、回归风险和 Git Diff。

Transition：

- pass → `READY_FOR_CONFIRMATION`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

## READY_FOR_CONFIRMATION

进入 Gate 前重新解析项目 `.loop` 的 `beforeFinalize`：

- `required`：等待用户接受最终结果。
- `automatic`：其他完成条件满足后自动通过。
- 用户拒绝：进入 `FIX`。

Transition：

- accepted / automatic → `DONE`
- rejected → `FIX`
- unsafe / denied → `BLOCKED`

## DONE / BLOCKED

`DONE` 要求所有 Acceptance Criteria、Verification、Review 和适用的 Final Approval Policy 均满足。Final Approval 可以因为项目 Trust 而自动通过。

`BLOCKED` 表示当前运行无法安全继续，必须保留原因和运行状态。

## Resume

恢复时：

1. 读取并校验 Runtime 状态。
2. 确认项目根目录和 Git 上下文。
3. 读取项目唯一 `.loop`。
4. 重新解析当前 Trust 和 Permission。
5. 从持久化 phase 继续。
6. 保留 run ID、计数器、Approval History 和 Evidence。
7. 配置、状态或仓库上下文无法安全对应时进入 `BLOCKED`。

绝不能使用聊天历史替代 Runtime 状态。

## State Transition Enforcement

每次转移前检查：

```text
current state
+ event/result
+ required artifacts/evidence
+ current project Trust/Permission
+ configured limits
→ allowed next state
```

未在 `loop/schemas/state.yaml` 定义的转移一律非法。不得跳过 Approval Gate，不得直接进入 `DONE`。

## Git Contract

INIT 记录 baseline branch 和 commit。完成前检查相对 baseline 的 Diff。

默认不自动 Commit 或 Push；必须同时满足项目 `.loop` Permission 和用户授权。

Git Capability Permission 与 Trust Level 独立。

## Evidence Contract

```text
Acceptance Criterion
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion Decision
        ↓
Final Approval Policy
```

Agent 自己声称完成不是 Evidence。

## Safety

Trust Level 只能减少 Trust-controlled Gate 的人工审批，不能绕过 Capability deny、dangerous-operation policy、Secret / Production protection 或 Loop safety limits。

## Cancellation

用户明确取消时立即停止，并持久化 Runtime 状态、Approval History 和未完成 Criteria。不得继续执行。
