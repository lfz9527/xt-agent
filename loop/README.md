# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态机、项目 Policy、Permission、Trust、Approval、安全边界和 Evidence。

## 核心架构

一个项目只需要一个根目录 `.loop` **文件**作为 Loop 的唯一项目级配置入口。

```text
<project-root>
├── .loop
└── ...
```

`.loop` 是文件，不是目录。项目不需要为了 Loop 增加其他固定配置文件或目录。

```text
Project
  │
  └── .loop
       ├── Trust
       ├── Permission
       └── Project Policy
              │
              ↓
       Policy Resolver
              │
              ↓
       Effective Policy
              │
              ↓
         Loop Runtime
```

## 职责边界

| 层 | 职责 |
|---|---|
| 项目 `.loop` | 项目 Trust、Permission、项目级 Loop Policy 的唯一来源 |
| `loop/config.yaml` | 引擎能力、固定工作流、默认限制、Trust 等级语义 |
| `loop/policies/default.yaml` | 引擎默认策略 |
| `loop/schemas/state.yaml` | Runtime 状态和合法状态转移 |
| `loop/schemas/evidence.yaml` | Evidence 数据模型 |
| `skills/loop/SKILL.md` | Agent 执行契约 |
| Runtime | 一次运行的状态和历史事实 |

Runtime 存储由宿主运行时管理，不规定项目根目录必须出现 `.loop-state.yaml`、`.loop-evidence/` 或 `.loop/evidence/` 等对象。

## `.loop`：项目唯一配置入口

推荐最小配置：

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

项目需要进一步收紧权限或增加项目级 Policy 时，继续写入这个 `.loop` 文件，而不是新增另一套项目配置。

## Trust

Trust 是**项目属性**，不是 Runtime 属性，也不是 Agent 可以自行提升的权限。

项目当前 Trust 的唯一真实来源：

```text
<project-root>/.loop
```

引擎定义 Trust 等级的通用语义：

| Trust | Before execution | Before finalize |
|---|---|---|
| `low` | required | required |
| `medium` | automatic | required |
| `high` | automatic | automatic |
| `full` | automatic | automatic |

Trust 只决定 Trust-controlled Approval Gate 的默认人工参与程度。

Trust **不能**：

- 把 `deny` Capability 变成 `allow`
- 绕过危险操作的独立安全策略
- 绕过 Secret / Production 等硬性保护
- 修改 Loop 的安全上限

## Permission

Permission 决定 Agent **能不能做某件事**；Trust 决定在允许的情况下**是否默认需要人工审批**。

```text
Trust
  ↓
Approval default

Permission
  ↓
Capability decision

Security Policy
  ↓
Hard safety boundary

State Machine
  ↓
Lifecycle decision
```

显式 `deny` 永远优先。

项目权限示例：

```yaml
# 项目权限策略。
permissions:
  filesystem:
    # 允许读取项目文件。
    read: allow
    # 允许修改项目文件。
    write: allow
  shell:
    # 允许普通 Shell 命令。
    execute: allow
    # 危险命令仍受独立安全策略约束。
    dangerous: confirm
  git:
    # 允许读取 Git 信息。
    read: allow
    # Commit 的审批策略。
    commit: confirm
    # Push 的审批策略。
    push: confirm
  network:
    # 网络请求默认需要确认。
    request: confirm
```

## Policy Resolution

Loop 在启动、恢复和进入 Trust-controlled Gate 前解析当前项目配置：

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

`inherit` 表示对应审批策略跟随项目 Trust。

如果配置冲突、缺失或无法安全解析，Loop 必须进入 `BLOCKED`，不能猜测。

## Runtime

Runtime 只保存一次运行的事实，例如：

```text
Run ID
State
Iteration
Task
Goal
Plan
Verification
Review
Approval History
Evidence
Git Baseline
```

Runtime **不保存项目 Trust 或 Permission 的第二份配置**。

Approval History 只记录已经发生的审批事实，例如 Gate、时间、决策和策略摘要；它不是项目配置来源。

Runtime 的具体持久化位置由宿主运行时决定，因此项目结构不需要 `.loop-state.yaml` 或 `.loop-evidence/`。

## Trust 修改

用户修改项目 `.loop` 后：

1. 后续尚未决策的 Trust-controlled Gate 必须重新读取 `.loop`。
2. 后续 Gate 使用新的 Trust Policy。
3. 已经完成的 Approval Event 不被倒推修改。
4. 如果当前 Runtime 与项目配置无法安全对应，进入 `BLOCKED`。

## State Machine

正常路径：

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

失败路径：

```text
VERIFY / REVIEW / READY_FOR_CONFIRMATION
                  ↓
                 FIX
                  ↓
              IMPLEMENT
```

只有 `loop/schemas/state.yaml` 定义的状态转移合法。

## Approval Gate

### Before Execution

Goal Review 完成后进入执行前 Gate：

- `required`：等待用户确认。
- `automatic`：自动通过。

### Before Finalize

Review 完成后进入最终 Gate：

- `required`：等待用户接受结果。
- `automatic`：满足其他完成条件后自动通过。

Gate 属于 Loop 生命周期规则；是否需要人工参与由当前项目 Policy 和 Trust Resolution 决定。

## Resume

恢复时：

1. 读取 Runtime 状态。
2. 校验 State Schema。
3. 确认项目根目录和 Git 上下文。
4. 读取唯一 `.loop`。
5. 重新解析当前 Trust、Permission 和 Effective Policy。
6. 从持久化状态继续。
7. 不使用聊天历史猜测 Runtime 状态。
8. 无法安全对应时进入 `BLOCKED`。

## Evidence

Evidence 用于证明验收标准和验证结果：

```text
Acceptance Criteria
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion Decision
```

Agent 自己声称“完成”不能替代 Evidence。

Evidence 是 Runtime 事实模型，不是项目权限配置，也不要求固定的项目根目录存储路径。

## 设计原则

1. **项目只有一个 `.loop` 文件。**
2. **Trust 唯一归属项目。**
3. **Runtime 不拥有项目 Policy。**
4. **Permission 决定能不能做。**
5. **Trust 决定默认审批程度。**
6. **Approval 是 Gate，不是执行模式。**
7. **Security Policy 独立于 Trust。**
8. **State Machine 只负责生命周期。**
9. **Evidence 只负责证明结果。**
10. **Runtime 存储由宿主负责，不污染项目结构。**
