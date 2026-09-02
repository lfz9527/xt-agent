---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start, resume, or authorize Loop from an ordinary message.
---

# Loop v1

Loop 是通用的、有状态的 Agent 任务控制协议。Agent 负责工作；Loop 负责生命周期、Policy Resolution、Permission、Trust、Approval、Safety 和 Evidence。

## 项目 Loop 工作区

每个项目只需要一个根目录 `.loop/` **目录**。`.loop/` 是该项目所有 Loop 配置与运行产物的统一工作区。

```text
<project-root>
├── .loop/
│   ├── config.yaml
│   ├── runtime/
│   │   ├── state.yaml
│   │   ├── history.jsonl
│   │   └── policy-snapshot.yaml
│   ├── plans/
│   │   └── <run-id>.md
│   ├── specs/
│   │   └── <run-id>/<spec-id>.pecs.md
│   ├── evidence/
│   │   └── <run-id>/<evidence-id>.yaml
│   └── reviews/
│       └── <run-id>.md
└── ...
```

不同项目各自使用项目根目录下的 `.loop/`，运行产物不得跨项目共享。目录不存在时由 Runtime 按需创建；不要求项目预先创建空目录。

## `.loop/` 职责

- `.loop/config.yaml`：项目 Trust、Permission、项目级 Policy，唯一真实配置来源。
- `.loop/runtime/`：Loop Runtime 状态、历史和本次运行使用的 Policy Snapshot。
- `.loop/plans/`：Loop 生成的 Plan 产物。
- `.loop/specs/`：Loop 生成的 Spec / PECS 产物。
- `.loop/evidence/`：Loop 生成的 Evidence 产物。
- `.loop/reviews/`：Loop 生成的 Review 产物。

引擎侧定义仍位于：

- `loop/config.yaml`：引擎能力、固定工作流、默认限制和 Trust 等级语义。
- `loop/policies/default.yaml`：引擎默认策略。
- `loop/schemas/state.yaml`：Runtime 状态、合法转移和 Transition Guards。
- `loop/schemas/policy.yaml`：Permission / Security / Trust / Approval / Gate 决策契约。
- `loop/schemas/policy-snapshot.yaml`：一次运行使用的策略快照契约。
- `loop/schemas/evidence.yaml`：Evidence 数据模型。
- `loop/schemas/artifact.yaml`：`.loop/` 产物目录和命名契约。

## 配置与运行时边界

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
Loop Runtime
```

项目 `.loop/config.yaml` 是 Trust、Permission 和项目级 Policy 的唯一真实来源。Policy Snapshot 只记录某次运行实际使用的解析结果，不是第二份项目配置。

## Trigger

Loop 只能由显式 `/loop` 调用启动或恢复。普通对话不得隐式启动、恢复或授权 Loop 修改仓库。

## Trust / Permission / Approval

Trust 是项目属性，不是 Runtime 属性，也不是 Agent 自己可以提升的权限。

Permission 决定 Capability 能否执行；Trust 只影响 Trust-controlled Approval Gate 的默认人工参与程度。

Capability Decision 的统一结果为：

```text
Permission → deny / allow / confirm
```

- `deny`：立即阻断。
- `allow`：继续进入 Security / Approval 判断。
- `confirm`：Capability 本身允许，但必须进入 Approval，不得直接执行。

Approval Policy 的结果为：

```text
required / automatic
```

实际 Gate Event 的结果为：

```text
approved / rejected
```

最终执行必须同时满足 Capability、Security、Approval 和 State Guard。

显式 `deny` 永远优先；Trust 不能把 `deny` 变成 `allow`，也不能绕过高风险、Secret、Production 或 Loop safety limits。

## Policy Resolution

启动、恢复、进入 Trust-controlled Gate，以及每次 Capability 实际执行前，都必须解析并校验策略：

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
Policy Snapshot
 ↓
Gate / Capability Execution
```

每次运行保存 `policyRevision` 和 Policy Snapshot。实际执行前必须确认当前配置 Revision 与 Snapshot 一致；不一致必须 `BLOCKED`，禁止使用旧策略继续执行。

`inherit` 表示对应审批策略跟随当前项目 Trust。

如果配置冲突、缺失或无法安全解析，必须进入 `BLOCKED`，不得猜测。

## Runtime Contract

Runtime 只记录一次运行的事实：run ID、state / phase、counters、project context、request / acceptance criteria、plan/spec references、verification、review、approval history、evidence references、Git baseline 和 Policy Revision / Snapshot 引用。

Runtime 不得保存项目 Trust 或 Permission 的第二份配置。

## Transition Enforcement

状态转移不仅要求 `allowedNext` 合法，还必须满足 `loop/schemas/state.yaml` 定义的 Transition Guards。

```text
Current State
     ↓
Allowed Transition
     ↓
Transition Guards
     ↓
Policy / Evidence / Acceptance Checks
     ↓
Next State
```

禁止仅通过修改 Runtime 的 `status` 跳过 Approval、Verification、Review 或 Final Gate。

例如：

- `WAITING_FOR_GOAL_CONFIRMATION → PLAN` 必须存在 `beforeExecution` 的 `approved` Gate Event，并确认 Policy Revision 未变化。
- `VERIFY → REVIEW` 必须 `verification.status == passed`。
- `REVIEW → READY_FOR_CONFIRMATION` 必须 `review.status == passed`。
- `READY_FOR_CONFIRMATION → DONE` 必须验收标准全部通过、Verification / Review 通过，并满足 Final Gate。

## Lifecycle

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

`BLOCKED` 是不可继续的安全终止状态。可恢复的人为等待、外部依赖等待等情况使用 `PAUSED` 语义，不得把 `BLOCKED` 当作普通 Resume 状态。

## INIT

1. 定位项目根目录。
2. 加载 `AGENTS.md` 和相关 Skills。
3. 读取 `.loop/config.yaml`。
4. 加载或创建 `.loop/runtime/` 下的 Runtime。
5. 捕获 Git branch 和 baseline commit。
6. 解析当前 Project Policy、Trust 和 Permission。
7. 生成本次运行的 Policy Snapshot / Revision。
8. 无法安全解析时进入 `BLOCKED`。

## GOAL_REVIEW / PLAN / IMPLEMENT

GOAL_REVIEW 形成 Goal、Acceptance Criteria、Verification Strategy 和 High-level Plan。

进入执行前 Gate 后，根据已确定 Goal、项目规则和 Skills 形成 Plan，并将产物落盘到 `.loop/plans/<run-id>.md`。

如果任务需要结构化 Spec / PECS，在 Plan 阶段生成 `.loop/specs/<run-id>/<spec-id>.pecs.md`。

IMPLEMENT 只执行当前任务，并遵守 Project Permission、Security Policy、Policy Snapshot 和项目规则。

## VERIFY / REVIEW

VERIFY 必须执行适用的项目原生验证，并将结果作为 Evidence 落盘到 `.loop/evidence/<run-id>/<evidence-id>.yaml`。

- pass → `REVIEW`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

REVIEW 检查 Acceptance Criteria、Evidence、项目规则、实现质量、范围、回归风险和 Git Diff，结果落盘到 `.loop/reviews/<run-id>.md`。

- pass → `READY_FOR_CONFIRMATION`
- fail → `FIX`
- unsafe / denied → `BLOCKED`

## READY_FOR_CONFIRMATION / DONE

进入 Final Gate 前重新解析 `.loop/config.yaml` 并生成新的有效决策。若 Policy Revision 发生变化，不得使用旧 Snapshot。

- `required`：等待用户接受最终结果。
- `automatic`：满足其他完成条件后自动通过。
- 用户拒绝：`FIX`。
- unsafe / denied：`BLOCKED`。

`DONE` 要求所有验收标准、Verification、Review 和适用 Final Approval Policy 满足。

## Resume

恢复时：

1. 读取 `.loop/runtime/state.yaml`。
2. 校验 State Schema。
3. 确认项目根目录和 Git 上下文。
4. 读取 `.loop/config.yaml`。
5. 重新解析当前 Trust、Permission 和 Effective Policy。
6. 比较当前 Policy Revision 与 Runtime Snapshot。
7. Revision 不一致时 `BLOCKED`，不得继续执行旧策略。
8. 从持久化 Runtime 状态继续。
9. 通过 `run-id` 读取对应 Plan、Spec、Evidence、Review 产物。
10. 不使用聊天历史猜测状态。
11. 无法安全对应时进入 `BLOCKED`。

## Evidence

Evidence 用于证明 Acceptance Criteria、Verification 和 Review 结果。Agent 自己声称完成不能作为 Evidence。

Evidence 数据结构遵循 `loop/schemas/evidence.yaml`，存储路径遵循 `loop/schemas/artifact.yaml`。

## Git / Safety / Cancellation

INIT 记录 baseline branch 和 commit；完成前检查相对 baseline 的 Diff。默认不自动 Commit 或 Push。Git Capability Permission 与 Trust 独立。

用户明确取消时立即停止当前运行，并由 Runtime 保留取消事实和未完成状态。不得继续执行。
