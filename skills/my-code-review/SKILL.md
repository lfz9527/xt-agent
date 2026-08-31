# Code Review Skill

> **默认使用中文进行 Review、问题说明、修复建议和最终报告。** 代码、API、类名、函数名、错误信息等原文保持原样。

## 目标

提供三种审查范围：Change Review、Global Review、Deep Review。

- Change Review：审查当前变化及直接受影响代码。
- Global Review：审查变化后的整个项目状态，重点发现重复资产和架构问题。
- Deep Review：周期性进行全面的项目健康检查。

## 生命周期

```text
Preflight -> Review Profile -> Change Review -> Verification -> Global Review -> Commit Gate
```

普通开发优先 Change Review；提交前必须执行 Change Review + Global Review；项目治理时执行 Deep Review。

## Preflight

正式 Review 前必须执行 `workflows/preflight.md`。

Preflight 负责确认：

- 项目根目录和 Git 状态
- 当前分支与 Base
- 主要语言、框架和 Runtime
- Review Scope
- 可用的 Test、Lint、Typecheck、Build、Static Analysis 能力
- 项目级 Review 配置和规则（如果存在）
- Regex / Pattern 等确定性预检查

项目级配置不属于 Skill 本身。Skill 被复制到项目后，可以在项目根目录提供：

```text
code-review.yaml
code-review.rules.yaml
code-review.regex.yaml
```

不存在时不得虚构；Regex 命中必须结合代码上下文进行语义判断。

## 规则分层

Skill 内置规则按以下顺序组合：

```text
Universal
  +
Language
  +
Framework / Runtime
  +
Project
  ↓
最终 Review Policy
```

不同语言必须使用不同 Review 重点，不同框架必须使用框架语义审查。当前 V1 提供 TypeScript、Python、Go、Rust、Java，以及 React、NestJS 规则。

语言规则位于 `rules/<language>/rules.yaml`；通用规则位于 `rules/universal/rules.yaml`。Regex 等确定性 Pattern 位于 `patterns/`。

## Change Review

从 diff 开始，必要时扩展到直接影响的函数、类、模块、调用方和被调用方。检查正确性、边界条件、错误处理、异步/并发、安全/授权、API 兼容性、数据一致性/事务、性能、测试、可维护性和项目规则。不要把猜测当成事实。

详细流程：`workflows/change-review.md`

## Global Review

Global Review 不是重新审查 diff，而是回答：变化进入项目后，整个代码库有没有变得重复、碎片化或架构退化？

重点检查：组件、Hook/Composable、工具函数、Type/DTO/Schema/Model、Service/UseCase、业务逻辑、API/Client、验证/缓存/日志能力的语义重复，以及依赖碎片化、模块边界、循环依赖、跨层访问和 Dead/obsolete code。

重复判断以语义为主，不只比较名称或文本。每个重复问题至少提供两个位置和证据；不确定时标记人工确认。

详细流程：`workflows/global-review.md`

## Commit Review

提交前执行 Change Review -> 修复阻断问题 -> 验证 -> Global Review -> 修复结构问题 -> 再次验证 -> Commit。

详细流程：`workflows/commit-review.md`

## Deep Review

用于周期性治理整个项目，建立 Components、Utilities、Types、Services、API、Packages、Dependencies 等资产画像，发现长期积累的语义重复、架构漂移和技术栈碎片化。

详细流程：`workflows/deep-review.md`

## 严重程度

```text
🟥 P0 · 致命
🟧 P1 · 严重
🟨 P2 · 一般
⬜ P3 · 建议
```

- P0/P1：默认阻断提交。
- P2/P3：默认非阻断，但必须进入 Review 报告。
- 同一优先级内使用 `P0-1`、`P0-2`、`P1-1` 等编号，仅在当前 Review 内有效。

## Finding

- Type 与 Priority 必须分离。
- 同一个问题只能产生一个 Finding；多个受影响位置统一列出。
- P0/P1 必须尽可能提供代码、调用关系、测试、配置或验证结果等证据。
- 不确定的问题应降低优先级并提供 Confidence，必要时要求人工确认。
- 不得因为个人代码风格偏好将问题提升为 P0/P1。

```text
[P1-1] 标题
类型：Security
位置：file:line
受影响位置：
问题：
影响：
证据：
建议：
Confidence：0.00-1.00
```

## 验证

从项目配置中找到真实存在的 Test、Lint、Typecheck、Build、Static Analysis 命令。禁止凭空发明项目命令。

## Commit Gate

```text
P0 > 0 → REQUEST_CHANGES
P1 > 0 → REQUEST_CHANGES
P2 > 0 → PASS_WITH_WARNINGS
P3 > 0 → PASS_WITH_WARNINGS
全部为 0 → PASS
```

## 最终输出

审查范围和技术栈、按 P0/P1/P2/P3 分类的问题、证据与 Confidence、验证结果、Global Review 结果、最终结论 `PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`。
