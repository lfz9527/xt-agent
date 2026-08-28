# xt-agent 后续发展规划

> 当前基线：Loop v1 / P0+ 收尾
>
> 本文是项目级路线图，不属于 Loop v1 执行规则。

## 1. 产品定位

`xt-agent` 不开发自己的 Desktop、IDE、Sandbox 或完整 Agent Harness。

它依托现有 Agent / Harness 环境运行，例如 Codex、Claude Code、DeepSeek Harness、Pi、GitHub Codespaces，以及其他兼容的 Agent Runtime / Harness。

`xt-agent` 的定位是：

> **跨 Agent / Harness 的 Agent-native 开发工作流与协议层。**

核心目标不是替代 Agent Runtime，而是让开发流程、Skills、项目状态和经验能够跨不同 Agent / Harness 连续工作。

## 2. 核心抽象

```text
Agent / Harness
      │
      ▼
  xt-agent
      │
  ┌───┴────┐
  ▼        ▼
Skills    Loop
             │
             ▼
          .loop/
             │
             ▼
          Project
```

职责边界：

| 层 | 职责 |
|---|---|
| Agent | 推理、决策、工具调用、执行任务 |
| Harness | 提供 Agent 的运行环境、Session、工具、权限、Sandbox 等 |
| xt-agent | 提供跨环境可复用的开发协议与工作流 |
| Skill | 提供可复用能力与项目操作知识 |
| Loop | 管理开发任务生命周期、状态、门禁与证据 |
| Project | 提供业务、技术、架构和工程上下文 |
| `.loop/` | 保存项目级 Agent 开发状态、计划、证据和历史 |

## 3. 当前版本：Loop v1 / P0+

当前版本先收尾，不继续扩大范围。

已经建立 Generic Loop workflow、Project-local `.loop/`、Persistent state、State transitions、Acceptance Criteria、Verification / Evidence、Git baseline、Confirmation gates、Resume protocol，以及项目特定的测试/验证约定。

核心原则：

```text
Loop = Process
Agent = Reasoning / Execution
Skill = Capability
Harness = Runtime Environment
Project = Context
.loop = Project-local Development State
Evidence = Completion Proof
```

## 4. 下一阶段：Loop Protocol / Reference Runtime

这里的 Runtime 不是重新开发一个 Agent Harness。

目标是提供一个最小、可移植的 Loop Protocol / Reference Runtime，用于验证和执行 State loading、State validation、Transition validation、Phase contracts、Persistence、Resume、Safety limits 和 Evidence association。

```text
State
 + Event / Result
 + Policy
      ↓
Transition Validator
      ↓
Next State
      ↓
Persist
```

Runtime 不负责 LLM 推理、Desktop、Sandbox、Agent Session、具体 IDE、具体测试框架或业务逻辑，只负责 Loop 协议本身。

## 5. Cross-Agent / Harness Compatibility

这是 `xt-agent` 的核心价值方向。

同一个项目可以先后使用不同 Agent / Harness：

```text
Codex
  ↓
PLAN → IMPLEMENT → VERIFY 失败
  ↓
.loop/state.yaml

DeepSeek Harness
  ↓
/loop → 恢复 state → FIX → VERIFY

Claude Code
  ↓
/loop → REVIEW
```

Agent 可以更换，但项目级 Loop 状态保持连续。

后续应优先设计稳定的 Adapter / Integration Contract，而不是绑定某一家 Agent。

## 6. Harness Integration

策略：**适配，不重造。**

```text
Codex Adapter
Claude Adapter
DeepSeek Harness Adapter
Pi Adapter
Codespaces Adapter
        │
        ▼
 xt-agent Protocol
```

Adapter 只负责暴露 `/loop`、读取项目 `.loop/`、映射工具/事件、把 Agent 运行结果转换为 Loop Event，以及将 Loop 状态反馈给宿主环境。

Generic Loop 核心不得绑定某个 Harness 的内部 API。

## 7. Exploration Agent

在 Goal Review 前增加通用探索能力：

```text
/loop
  ↓
INIT
  ↓
EXPLORE
  ↓
Context sufficient?
  ├── No → Continue exploration
  └── Yes → GOAL_REVIEW
```

探索项目结构、项目指令、Skills、相关代码、测试与验证方式、Git 状态、`.loop/` 历史和潜在影响范围。

探索结果必须属于当前 Project，不得污染 Generic Loop。

## 8. Skill Discovery

让 Loop / Agent 根据任务动态发现项目所需 Skill：

```text
Task
 ↓
Project Context
 ↓
Skill Discovery
 ↓
Relevant Skills
 ↓
Agent Execution
```

Loop 不知道 NestJS、React、Python 等技术细节；Skill 和 Project Context 承担这些知识。

## 9. Multi-Agent Development

未来允许多个 Agent 协作，但生命周期仍由 Loop 统一控制。

```text
                Loop
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Explorer    Planner    Developer
                            │
                       Verification
                            │
                         Reviewer
```

Agent 角色可以变化，但 State、Transition、Evidence、Acceptance Criteria 仍由统一 Loop 协议管理。

## 10. Event / Trace / History

借鉴现代 Harness 的事件流思想，但保持项目级和跨环境兼容。

建议演进为：

```text
.loop/
├── state.yaml
├── runs/
│   └── <run-id>/
│       ├── events/
│       ├── plan.md
│       ├── tasks.md
│       ├── evidence/
│       └── result.md
└── learnings/
```

目标包括 Resume、Replay、Run history、Failure analysis、Agent handoff 和 Cross-Agent continuity。

## 11. Evidence System

继续强化“完成必须有证据”：

```text
Acceptance Criterion
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion Decision
```

后续可增加 Evidence provenance、Command / output / artifact 关联、Git diff 关联、Verification history，以及自动 Acceptance Criteria 汇总。

## 12. Project Learning

Loop 运行结果沉淀为项目经验：

```text
Loop Run
 ↓
Evidence
 ↓
Observation
 ↓
Project Learning
```

经验优先保存到当前项目 `.loop/learnings/`，而不是直接修改 Generic Loop。

## 13. Controlled Evolution

长期目标不是让 Loop 无限制地“自己改自己”，而是建立受控进化：

```text
Observation
    ↓
Learning
    ↓
Candidate Rule / Skill
    ↓
Validation
    ↓
Human Approval
    ↓
Promotion
```

只有跨项目、可重复、经过验证的模式才应进入 Generic Layer。

## 14. Evolution Safety

Loop / xt-agent 的自我进化必须满足：

1. 运行中的 Loop 不直接修改自身核心规则。
2. 所有改进产生可追踪 Proposal。
3. Candidate 必须经过验证。
4. Generic Rule 升级必须保留来源和证据。
5. 需要人工确认的升级不得绕过确认门禁。
6. 状态模型需要保持兼容或提供迁移。
7. 每次升级都必须可回滚。

目标：

> **观察 → 学习 → 提议 → 验证 → 批准 → 升级**

## 15. Roadmap

```text
Loop v1 / P0+
  │
  │ 当前版本收尾
  ▼
Loop v1.x
  │
  ├── Protocol / Reference Runtime
  ├── Transition enforcement
  ├── Resume
  └── Run history
  │
  ▼
Cross-Agent Layer
  │
  ├── Adapter Contract
  ├── Codex / Claude / Pi integration
  ├── DeepSeek Harness integration
  └── Codespaces integration
  │
  ▼
Loop v2
  │
  ├── Exploration Agent
  ├── Skill Discovery
  ├── Multi-Agent orchestration
  └── richer Evidence
  │
  ▼
Loop v2.x
  │
  ├── Project Learning
  └── Cross-project patterns
  │
  ▼
xt-agent v3
  │
  └── Controlled Evolution
```

## 16. 长期愿景

`xt-agent` 不需要成为另一个 Codex、Claude Code 或 DeepSeek Harness。

它更适合作为这些 Agent / Harness 之上的一层：

```text
             Agent Ecosystem
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     Codex        Claude       DeepSeek
       │            │          Harness
       └────────────┼────────────┘
                    ▼
                 xt-agent
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
        Skills               Loop
                              │
                              ▼
                           .loop/
                              │
                              ▼
                           Project
```

最终希望实现的是：

> **Agent 可以替换，Harness 可以替换，项目开发过程不应该被重置。**

`xt-agent` 的核心资产不是某一个 Agent，而是可跨环境复用的 Workflow、Protocol、Skills、Project State、Evidence 和 Learning。
