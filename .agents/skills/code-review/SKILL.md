# Code Review Skill

> **默认使用中文进行 Review、问题说明、修复建议和最终报告。** 代码、API、类名、函数名、错误信息等原文保持原样。

## 目标

本 Skill 提供三种审查范围：

- **Change Review（变化审查）**：审查当前变化及直接受影响代码。
- **Global Review（全局审查）**：审查变化后的整个项目状态，重点发现重复资产和架构问题。
- **Deep Review（深度审查）**：周期性进行更全面的项目健康检查。

## 生命周期

```text
项目检测 -> Review Profile -> Change Review -> 验证 -> Global Review -> Commit Gate
```

普通开发优先 Change Review；**提交前必须执行 Change Review + Global Review**；需要治理项目时执行 Deep Review。

## 项目检测

Review 前先读取语言/版本、运行时、框架、依赖清单、测试/Lint/Typecheck/Build 配置，以及 `AGENTS.md`、`.agents/`、`CLAUDE.md`、`.cursor/rules`、README 和 docs 等项目规则。

形成 Review Profile，并且只加载与当前技术栈和受影响代码相关的规则。

## 规则分层

```text
通用规则
  + 语言规则
  + 框架/运行时规则
  + 项目规则
```

规则不是固定清单。不同语言必须使用不同的 Review 重点；不同框架也必须使用框架语义进行审查。

当前 V1 提供：

- `rules/universal.md`
- `rules/typescript.md`
- `rules/python.md`
- `rules/go.md`
- `rules/rust.md`
- `rules/java.md`
- `rules/react.md`
- `rules/nestjs.md`

## Change Review

从 diff 开始，必要时扩展到直接影响的函数、类、模块、调用方和被调用方。

重点检查：正确性、边界条件、错误处理、异步/并发、安全/授权、API 兼容性、数据一致性/事务、性能、测试、可维护性和项目规则。

不要把猜测当成事实。优先使用代码、测试、静态检查或最小复现作为证据。

详细流程见 `workflows/change-review.md`。

## Global Review

Global Review **不是重新审查 diff**，而是回答：

> 这次变化进入项目后，整个代码库有没有变得重复、碎片化或架构退化？

重点检查：

- 重复组件
- 重复 Hook / Composable
- 重复工具函数
- 重复 Type / Interface / DTO / Schema / Model
- 重复 Service / UseCase
- 重复业务逻辑
- 重复 API / Client / 数据访问能力
- 重复验证、缓存、日志、格式化等能力
- 多套库承担同一种职责
- 模块边界和依赖方向
- 循环依赖
- 跨层访问和职责泄漏
- Dead / obsolete code

**重复检测必须以语义为主，而不是只比较名称或文本。** 发现重复时，优先考虑复用已有资产或合并抽象，而不是继续创建新的实现。

每个重复问题至少给出两个相关位置以及为什么认为它们重复；不确定时标记为“建议人工确认”。

详细流程见 `workflows/global-review.md`。

## Commit Review

Commit Review 是提交前质量门禁：

```text
Change Review
  -> 修复阻断问题
  -> 验证
  -> Global Review
  -> 修复阻断结构问题
  -> 再次验证
  -> Commit
```

详细流程见 `workflows/commit-review.md`。

## Deep Review

Deep Review 用于周期性治理整个项目，建立 Components、Utilities、Types、Services、API、Packages、Dependencies 等资产画像，并发现长期积累的语义重复、架构漂移和技术栈碎片化。

详细流程见 `workflows/deep-review.md`。

## 验证

尽可能从项目配置中找到真实存在的 Test、Lint、Typecheck、Build、Static Analysis 命令进行验证。**禁止凭空发明项目命令。**

## 严重程度

- `BLOCKER`：无法安全集成，或存在严重生产/数据/安全影响。
- `CRITICAL`：严重且已确认的缺陷或安全问题。
- `HIGH`：重要 Bug、回归、授权、一致性或架构违规。
- `MEDIUM`：有实际意义的风险、性能或维护问题。
- `LOW`：轻微质量问题。
- `INFO`：非阻断改进建议。

## Finding 格式

```text
[SEVERITY] 标题
位置：file:line
问题：
影响：
证据：
建议：
Confidence：0.00-1.00
```

除代码标识符、错误信息等必须保留原文的内容外，Review 内容和报告默认使用中文。

## 最终输出

必须包含：

1. 审查范围和检测到的技术栈
2. 按严重程度分组的问题
3. 验证结果
4. Global Review 结果
5. 最终结论：`PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`

不能因为 diff 本身看起来正确，就跳过 Global Review；Global Review 的存在就是为了发现变化造成或暴露的项目级问题。
