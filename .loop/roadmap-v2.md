# Loop 后续演进规划

> 当前版本：Loop v1 / P0+ 收尾规划
>
> 本文属于项目级路线图，记录当前版本完成后的后续方向，不作为当前 Loop v1 的执行规则。

## 1. 当前版本收尾

当前 `feat/loop-p0-plus` 已完成 Loop v1 的核心规范化工作：

- `Loop/` 统一为 `loop/`。
- Loop 与项目业务内容解耦。
- 项目运行产物归属当前项目的 `.loop/`。
- 建立 `.loop/state.yaml` 的持久化状态模型。
- 建立 Acceptance Criteria 与 Evidence 的结构化关联。
- 建立 Git baseline / diff 规则。
- 建立可恢复的状态生命周期。
- 将 `skills/loop/SKILL.md` 从流程说明进一步收紧为 Phase Contract。
- 明确测试不是唯一 Verification 方法，不假设具体测试框架或测试文件命名。
- 明确 `DONE`、`BLOCKED`、`FIX` 和确认门禁。

这一阶段的目标是：**先让 Loop v1 成为稳定、通用、可恢复的开发流程协议。**

---

## 2. 下一阶段：Loop Runtime

### 目标

把当前的 Skill + Config + Schema 从“Agent 应该遵守的规则”进一步演进为可执行的 Runtime/State Machine。

### 主要工作

1. 实现 State Loader。
2. 实现 State Validator。
3. 实现 Transition Validator。
4. 实现 Phase Executor Contract。
5. 实现 State Persistence。
6. 实现 Resume。
7. 实现安全终止与 `BLOCKED`。
8. 为 Runtime 增加状态转换测试。

### 核心模型

```text
State + Event / Result + Policy
              ↓
    Transition Validator
              ↓
         Next State
              ↓
           Persist
```

Runtime 不负责业务逻辑，也不负责替 Agent 做技术决策，只负责状态、允许的动作、合法转换、安全限制、持久化和恢复。

---

## 3. Exploration Agent

在 PLAN 之前增加通用项目探索能力，避免 Agent 在上下文不足时直接制定计划。

```text
/loop → INIT → EXPLORE → Context sufficient?
                         ├─ No → Continue exploration
                         └─ Yes → GOAL_REVIEW
```

探索应关注项目结构、项目指令、相关 Skills、代码、测试与验证方式、`.loop/` 历史、Git 状态和影响范围。探索结果必须与当前项目绑定，不能污染 Generic Loop。

---

## 4. Skill Discovery

让 Loop 根据任务和项目上下文动态发现、选择相关 Skill，而不是把技术规则硬编码进 Loop。

```text
Task → Project Context → Skill Discovery → Relevant Skills → Agent Execution
```

核心边界：`Loop = Process`、`Skill = Capability`、`Agent = Reasoning / Execution`、`Project = Context`。

---

## 5. Multi-Agent Development

逐步支持 Explorer、Planner、Developer、Verification、Reviewer 等角色，但仍由 Loop 统一控制生命周期。

```text
Loop
 ├── Explorer
 ├── Planner
 ├── Developer
 ├── Verification
 └── Reviewer
```

角色不是独立的生命周期管理器；状态和流程控制仍由 Loop 负责。

---

## 6. Evidence System

进一步让“完成”从 Agent 的主观判断变成可验证结果：

```text
Acceptance Criterion → Verification / Review → Evidence → Completion Decision
```

后续可增加 Evidence provenance、命令/输出/artifact 关联、Acceptance Criteria 自动汇总，以及 Git diff 与 Evidence 关联。

---

## 7. Loop History

在项目侧保存每次 Loop Run 的历史，为后续分析和 Evolution 提供数据：

```text
.loop/
├── state.yaml
├── runs/
│   └── <run-id>/
│       ├── plan.md
│       ├── tasks.md
│       ├── evidence/
│       └── result.md
└── learnings/
```

---

## 8. Loop Learning

先限定为项目级经验沉淀：

```text
Loop Run → Evidence → Observation → Project Learning
```

项目经验写入当前项目 `.loop/learnings/`，不直接修改 Generic Loop。

---

## 9. Loop Evolution

长期目标是让 Loop 能发现执行模式并提出改进，但**不能未经验证直接修改自身核心规则**。

```text
Observation
    ↓
Learning
    ↓
Candidate Rule
    ↓
Validation
    ↓
Human Approval
    ↓
Generic Loop Update
```

只有跨项目、可重复、经过验证的模式才允许进入 Generic Loop。

### Evolution Safety

1. 核心规则不能被运行中的 Loop 直接修改。
2. 所有改进必须产生可追踪 Proposal。
3. Candidate 必须经过验证。
4. Generic Rule 升级必须保留来源和验证证据。
5. 需要人工确认的变更不得绕过确认门禁。
6. 规则升级必须保持状态兼容性。
7. 每次升级必须可以回滚。

---

## 10. 推荐版本路线

```text
Loop v1
  ↓
Loop v1.x
  ├── Runtime
  ├── Resume
  └── History
  ↓
Loop v2
  ├── Exploration Agent
  ├── Skill Discovery
  ├── Multi-Agent orchestration
  └── richer Evidence
  ↓
Loop v2.x
  ├── Project Learning
  └── Cross-project patterns
  ↓
Loop v3
  └── Controlled Loop Evolution
```

## 11. 当前决策

当前版本先收尾，不继续扩大 Loop v1 范围。

下一次开发从 **Loop Runtime** 开始，而不是直接进入 Evolution。

优先顺序：

1. Runtime / State Machine
2. Resume / History
3. Exploration Agent
4. Skill Discovery
5. Multi-Agent orchestration
6. Evidence enhancement
7. Project Learning
8. Controlled Evolution

最终边界保持：

> **Loop 管过程，Agent 做决策，Skill 提供能力，Project 提供上下文，`.loop/` 保存项目运行状态。**
