# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态机、项目 Policy、Permission、Trust、Approval、安全边界和 Evidence。

## 核心架构

每个项目都有一个根目录 `.loop/`，它是该项目的 Loop 工作区，统一承载项目配置和 Loop 运行产物。

```text
<project-root>
├── .loop/
│   ├── config.yaml
│   ├── runtime/
│   ├── plans/
│   ├── specs/
│   ├── evidence/
│   └── reviews/
└── ...
```

`.loop/` 是项目级 Loop Workspace，不应再创建 `.loop-state.yaml`、`.loop-evidence/` 等平行对象。

```text
Project
  │
  └── .loop/
       ├── config.yaml
       │    ├── Trust
       │    ├── Permission
       │    └── Project Policy
       │
       └── Runtime Artifacts
            ├── runtime/
            ├── plans/
            ├── specs/
            ├── evidence/
            └── reviews/
                    │
                    ↓
              Loop Runtime
```

## `.loop/` 目录结构

| 路径 | 职责 |
|---|---|
| `.loop/config.yaml` | 项目 Trust、Permission、项目级 Policy 的唯一来源 |
| `.loop/runtime/state.yaml` | 当前 Loop Runtime 状态 |
| `.loop/runtime/history.jsonl` | Runtime 历史事件 |
| `.loop/plans/<run-id>.md` | 当前运行生成的 Plan |
| `.loop/specs/<run-id>/<spec-id>.pecs.md` | 当前运行生成的 Spec / PECS |
| `.loop/evidence/<run-id>/<evidence-id>.yaml` | Verification / Review Evidence |
| `.loop/reviews/<run-id>.md` | 当前运行的 Review 结果 |

具体目录和命名规则以 `loop/schemas/artifact.yaml` 为准。

## 引擎定义与项目运行数据

| 层 | 职责 |
|---|---|
| `.loop/` | 当前项目的配置与运行产物工作区 |
| `loop/config.yaml` | 引擎能力、固定工作流、默认限制、Trust 等级语义 |
| `loop/policies/default.yaml` | 引擎默认策略 |
| `loop/schemas/state.yaml` | Runtime 状态和合法状态转移 |
| `loop/schemas/evidence.yaml` | Evidence 数据模型 |
| `loop/schemas/artifact.yaml` | `.loop/` 产物目录和命名契约 |
| `skills/loop/SKILL.md` | Agent 执行契约 |

引擎定义属于仓库本身；项目 `.loop/` 属于被 Loop 管理的项目。

## `.loop/config.yaml`

项目配置最小示例：

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

Trust 是**项目属性**，不是 Runtime 属性。

项目需要进一步收紧权限或增加项目级 Policy 时，继续修改 `.loop/config.yaml`，不创建第二套项目配置。

## Trust

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

显式 `deny` 永远优先。

## Policy Resolution

Loop 在启动、恢复和进入 Trust-controlled Gate 前解析当前项目配置：

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
Current Gate
```

如果配置冲突、缺失或无法安全解析，Loop 必须进入 `BLOCKED`，不能猜测。

## Runtime 与产物

一次 Loop 运行使用唯一 `run-id`，所有运行产物都放入 `.loop/` 工作区，并通过 `run-id` 建立关联。

```text
.loop/
├── runtime/
│   ├── state.yaml
│   └── history.jsonl
├── plans/
│   └── <run-id>.md
├── specs/
│   └── <run-id>/
│       └── <spec-id>.pecs.md
├── evidence/
│   └── <run-id>/
│       └── <evidence-id>.yaml
└── reviews/
    └── <run-id>.md
```

Runtime 可以记录 Plan、Spec、Evidence 和 Review 的引用，但不得保存项目 Trust 或 Permission 的第二份配置。

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

1. 读取 `.loop/runtime/state.yaml`。
2. 校验 State Schema。
3. 确认项目根目录和 Git 上下文。
4. 读取 `.loop/config.yaml`。
5. 重新解析当前 Trust、Permission 和 Effective Policy。
6. 根据 Runtime 状态继续执行。
7. 不使用聊天历史猜测 Runtime 状态。
8. 无法安全对应时进入 `BLOCKED`。

## Evidence

Evidence 用于证明验收标准和验证结果：

```text
Acceptance Criteria
        ↓
Verification / Review
        ↓
.loop/evidence/<run-id>/
        ↓
Completion Decision
```

Agent 自己声称“完成”不能替代 Evidence。

## 设计原则

1. **每个项目只有一个 `.loop/` 工作区。**
2. **Trust 唯一归属项目。**
3. **项目配置与 Runtime 产物都统一落在 `.loop/`。**
4. **Runtime 不拥有项目 Policy。**
5. **Permission 决定能不能做。**
6. **Trust 决定默认审批程度。**
7. **Approval 是 Gate，不是执行模式。**
8. **Security Policy 独立于 Trust。**
9. **State Machine 只负责生命周期。**
10. **Evidence 只负责证明结果。**
11. **所有运行产物通过 run-id 关联。**
