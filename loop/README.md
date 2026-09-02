# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态转移、权限、Trust、审批、安全限制和 Evidence。

## 核心架构

项目只需要一个根目录 `.loop` 文件作为 Loop 的**唯一项目级配置入口**。

```text
<project-root>
├── .loop                 # 唯一项目级 Loop 配置
├── .loop-state.yaml      # Runtime 状态（运行时生成）
├── .loop-evidence/       # Runtime Evidence（运行时生成）
└── ...
```

注意：`.loop` 是**文件**，不是目录。

```text
Project
  │
  └── .loop
       ├── Trust Level
       ├── Permission
       └── Project Policy
              │
              ↓
       Permission Resolver
              │
              ↓
       Effective Policy
              │
              ↓
         Loop Runtime
```

### 唯一职责边界

- `loop/config.yaml`：Loop 引擎默认值和 Trust 等级的通用语义，不保存任何具体项目的 Trust。
- `loop/policies/default.yaml`：引擎默认完成、Evidence、确认和安全策略。
- `loop/schemas/state.yaml`：一次 Loop Runtime 的状态模型和合法状态转移。
- `loop/schemas/evidence.yaml`：Evidence 数据模型。
- `skills/loop/SKILL.md`：Agent 执行契约。
- `<project>/.loop`：项目自己的 Trust、Permission 和项目级 Loop Policy。
- `.loop-state.yaml` / `.loop-evidence/`：运行时生成的数据，不是项目配置来源。

## Trust Level

Trust 是**项目属性**，不是 Loop Runtime 属性，也不是 Agent 自己可以提升的运行时权限。

项目通过根目录唯一的 `.loop` 文件声明当前 Trust：

```yaml
# 项目级 Loop 配置。
version: 1

# Trust 属于项目。
trust: low

permissions:
  approval:
    # 跟随当前项目 Trust Level。
    beforeExecution: inherit
    beforeFinalize: inherit
```

Trust 等级的通用语义由 Loop 引擎定义：

| Level | Before execution | Before finalize | High-risk actions |
|---|---|---|---|
| `low` | User approval | User approval | Independent policy |
| `medium` | Automatic | User approval | Independent policy |
| `high` | Automatic | Automatic | Independent policy |
| `full` | Automatic | Automatic | Still subject to hard safety boundaries |

Trust 只决定 Trust-controlled Approval Gate 的默认行为。它不能覆盖：

- Capability Permission 的 `deny`
- 高风险操作的独立确认
- Secret / Production 等硬性安全边界
- Loop 的迭代和失败上限

### Trust 不进入 Runtime 配置

Runtime **不得保存 `permission.trust.level`、`trust.level` 等第二份项目 Trust 配置**。

每次 Loop 启动、恢复以及进入受 Trust 控制的 Approval Gate 时：

```text
project/.loop
      ↓
resolve Trust + Permission
      ↓
Effective Policy
      ↓
current Gate
```

Runtime 可以保存审批历史，例如谁、在什么时候、基于什么策略通过了某个 Gate，但审批历史不是 Trust 配置。

如果项目 Trust 被用户修改，后续 Gate 使用新的项目策略；已经发生的审批事件不会被倒推修改。

## Permission

Permission 和 Trust 是两个不同概念：

```text
Trust
  ↓ 默认 Approval 行为
Permission
  ↓ 具体 Capability 是否允许
Approval
  ↓ 当前 Gate 是否需要人工参与
State Machine
  ↓ 当前 Loop 阶段
```

项目可以在 `.loop` 中显式收紧权限：

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

显式 `deny` 永远优先于 Trust。Trust 不能把一个被 Capability Permission 拒绝的操作变成允许。

## Runtime

Runtime 只负责一次 Loop 的执行状态，例如：

```yaml
run:
  id: <unique-run-id>
  status: IMPLEMENT

context:
  projectRoot: <project-root>
  baselineCommit: <git-commit-sha>
  baselineBranch: <git-branch>

approval:
  history: []
```

Runtime 不保存项目 Trust。恢复时重新读取项目 `.loop`，重新解析当前有效 Permission Policy。

## Flow

```text
/loop
  ↓
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

失败路径：

```text
VERIFY / REVIEW / READY_FOR_CONFIRMATION
                  ↓
                 FIX
                  ↓
              IMPLEMENT
```

Loop 只从显式 `/loop` 调用启动。普通对话不能隐式启动、恢复或授权 Loop 修改项目。

## Approval Gate

当前有两个主要 Trust-controlled Gate：

### Before Execution

`GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN`

- `required`：等待用户确认。
- `automatic`：自动通过。

### Before Finalize

`REVIEW → READY_FOR_CONFIRMATION → DONE`

- `required`：等待用户接受结果。
- `automatic`：满足其他完成条件后自动通过。

Approval Gate 是否存在由 Completion/Confirmation Policy 决定；是否需要人工参与由当前项目的 Trust/Permission Policy 决定。

## Resume

恢复 Runtime 时：

1. 读取 Runtime 状态。
2. 校验 State Schema 和当前阶段。
3. 确认项目根目录。
4. 读取项目唯一 `.loop`。
5. 解析当前 Trust 和 Permission Policy。
6. 校验当前 Git 上下文。
7. 从持久化阶段继续执行，不依赖聊天历史猜测状态。
8. 如果项目配置、Runtime 状态或仓库上下文无法安全对应，进入 `BLOCKED`。

## State Machine

只有 `loop/schemas/state.yaml` 中定义的转移合法。

正常路径：

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

修复路径：

- `VERIFY → FIX → IMPLEMENT`
- `REVIEW → FIX → IMPLEMENT`
- `READY_FOR_CONFIRMATION → FIX → IMPLEMENT`

任何活动状态在无法安全继续、权限不足或达到限制时都可以进入 `BLOCKED`。

## Evidence

Evidence 把 Acceptance Criteria、Verification、Review 和 Completion 连接起来：

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

Agent 自己声称“已经完成”不能替代实际 Evidence。

## 设计原则

1. **项目只有一个 `.loop` 配置文件。**
2. **Trust 唯一归属项目，不归属 Runtime。**
3. **Runtime 不复制项目 Trust 配置。**
4. **Permission 决定能不能做，Trust 决定默认需要多少人工审批。**
5. **Approval 是 Gate，不是执行模式。**
6. **Trust 不能绕过 Capability Permission 和硬性安全边界。**
7. **状态机负责生命周期，不负责定义 Trust。**
8. **Evidence 负责证明结果，不负责决定权限。**
