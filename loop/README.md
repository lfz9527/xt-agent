# Loop v1

Loop 是通用的、有状态的 Agent 任务控制层。Agent 负责完成工作，Loop 负责生命周期、状态机、项目 Policy、Permission、Trust、Approval、安全边界、Resource Governance 和 Evidence。

## 核心架构

每个项目只有一个根目录 `.loop/`，它统一承载项目配置和所有 Run 的运行产物。一个 Project 可以有多个并行 Run。

```text
Project
  │
  └── .loop/
       ├── config.yaml
       │    ├── Trust
       │    ├── Permission
       │    └── Project Policy
       │
       └── Runtime
            ├── runs/<run-id>/       ← Run 私有状态与派生产物
            ├── history.jsonl        ← 跨 Run 审计事实
            └── locks/               ← 资源级互斥
```

`.loop/` 是项目级 Loop Workspace，不应再创建 `.loop-state.yaml`、`.loop-evidence/` 等平行对象。

## `.loop/` 目录结构

```text
.loop/
├── config.yaml
├── runtime/
│   ├── runs/
│   │   └── <run-id>/
│   │       ├── state.yaml
│   │       ├── mutation-journal.jsonl
│   │       └── replay-report.json
│   ├── history.jsonl
│   └── locks/
│       └── <resource>.lock
├── plans/<run-id>.md
├── specs/<run-id>/<spec-id>.pecs.md
├── evidence/<run-id>/<evidence-id>.yaml
└── reviews/<run-id>.md
```

| 路径 | 职责 |
|---|---|
| `.loop/config.yaml` | 项目 Trust、Permission、项目级 Policy 的唯一来源 |
| `.loop/runtime/runs/<run-id>/state.yaml` | 当前 Run 独立 Runtime State |
| `.loop/runtime/runs/<run-id>/mutation-journal.jsonl` | 当前 Run 的资源 Mutation 历史 |
| `.loop/runtime/runs/<run-id>/replay-report.json` | P2-5 从审计历史物化出的 Replay Report |
| `.loop/runtime/history.jsonl` | 跨 Run 的 append-only Runtime 历史事件 |
| `.loop/runtime/locks/<resource>.lock` | 共享资源互斥锁 |
| `.loop/plans/<run-id>.md` | 当前 Run 生成的 Plan |
| `.loop/specs/<run-id>/<spec-id>.pecs.md` | 当前 Run 生成的 Spec / PECS |
| `.loop/evidence/<run-id>/<evidence-id>.yaml` | Verification / Review Evidence |
| `.loop/reviews/<run-id>.md` | 当前 Run 的 Review 结果 |

具体目录和命名规则以 `loop/schemas/artifact.yaml` 为准。

### P2-5 Replay Report

P2-5 的权威事实仍然是：

```text
.loop/runtime/history.jsonl
```

Replay 后生成的报告落盘到当前 Run：

```text
.loop/runtime/runs/<run-id>/replay-report.json
```

它是派生文件，用于诊断、审计查看和后续 API / UI 消费；不能反向替代 `history.jsonl` 作为 Runtime 真相源。

## Run 与 Resource

Loop 不使用 Project 级 `run.lock`。Run 和资源锁是两个不同概念：

```text
Project
├── Run A ─────────────┐
├── Run B ─────────────┤
└── Run C ─────────────┘
                       ↓
                Resource Governance
                       ↓
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       READONLY      MUTABLE      PROTECTED
```

Run ID 是独立执行上下文的稳定身份，负责关联 State、Plan、Spec、Evidence、Review、Snapshot、Approval 和 Audit。

## Resource Governance

资源修改必须依次经过：

```text
Resource Policy
      ↓
这个资源允许修改吗？
      ↓
Capability
      ↓
当前 Run 是否拥有修改能力？
      ↓
Approval
      ↓
是否满足授权 Gate？
      ↓
Resource Lock
      ↓
当前是否存在竞争 Run？
      ↓
Mutation
```

### Resource Policy

资源有三种基本类型：

| 类型 | 含义 |
|---|---|
| `readonly` | 只能读取，任何 Mutation 都拒绝 |
| `mutable` | 可以修改，但必须匹配 `allowedCapabilities` |
| `protected` | 默认禁止修改，只有明确特权 Capability 可以修改 |

默认策略：

- `working-tree`：`mutable`，允许代码、测试和普通产物修改。
- `.loop/config.yaml`：`protected`，仅 `loop.policy.modify`。
- `.loop/policies`：`protected`，仅 `loop.policy.modify`。
- `.loop/schemas`：`protected`，仅 `loop.schema.modify`。
- `.git`：`readonly`，禁止直接 Mutation。

### Resource Lock

Lock 只负责并发互斥，不负责权限判断。

```text
Run A → src/a.ts lock → MODIFY
Run B → src/b.ts lock → MODIFY
Run C → src/a.ts lock → WAIT / BLOCKED
```

因此多个 Run 可以并行分析、Plan、Review，并可在资源不冲突时并行修改。

Lock owner 必须是当前 Run。锁文件存在但无法安全确认状态时，Runtime 必须阻断，不得猜测或强制抢占。

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

## Trust / Permission / Approval

Trust 是**项目属性**，不是 Runtime 属性，也不是 Agent 自己可以提升的权限。

Permission 决定 Capability 能不能执行；Trust 决定在允许的情况下默认是否需要人工审批；Approval 是实际 Gate。

显式 `deny` 永远优先。Trust、Approval 或 Agent 意图都不能覆盖安全硬边界。

## Runtime Enforcement

所有 Capability、Resource Mutation 和 State Transition 都必须通过 `LoopRuntimeKernel`。

```text
Capability
   ↓
Policy Revision / Snapshot
   ↓
Capability Decision
   ↓
Approval
   ↓
Resource Policy
   ↓
Resource Lock
   ↓
Executor
```

Policy Revision mismatch、非法 Transition、资源权限拒绝、锁竞争或安全拒绝必须阻断，不得降级成成功。

## Policy Resolution

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
```

配置冲突、缺失或无法安全解析时，Loop 必须进入 `BLOCKED`，不能猜测。

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

只有 `loop/schemas/state.yaml` 定义的状态转移合法。`PAUSED` 是可恢复等待态；`BLOCKED` 是安全终止态。

## Resume

恢复时：

1. 根据 Run ID 定位 `.loop/runtime/runs/<run-id>/state.yaml`。
2. 校验 State Schema、Run ID、Snapshot 和 Policy Revision。
3. 确认项目根目录和 Git 上下文。
4. 读取 `.loop/config.yaml` 并重新解析 Policy。
5. Revision mismatch 则 `BLOCKED`。
6. 校验该 Run 的 Plan / Spec / Evidence / Review。
7. 根据 State Machine 和 Transition Guard 恢复。
8. 不使用聊天历史猜测 Runtime 状态。

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
2. **一个 Project 可以存在多个 Run。**
3. **Run ID 是执行身份，不是 Project 锁。**
4. **资源是否可修改由 Resource Policy 决定。**
5. **Capability 决定当前 Run 是否具备修改能力。**
6. **Trust 决定默认审批程度。**
7. **Approval 是 Gate，不是执行模式。**
8. **Resource Lock 只负责并发互斥。**
9. **Security Policy 独立于 Trust。**
10. **State Machine 只负责生命周期。**
11. **Evidence 只负责证明结果。**
12. **所有运行产物通过 run-id 关联。**
13. **Replay Report 是派生文件，`history.jsonl` 是权威审计事实。**
