# Code Review Skill

> **默认使用中文进行 Review、问题说明、修复建议和最终报告。** 代码、API、类名、函数名、错误信息等原文保持原样。

## 目标

提供三种审查范围：Change Review、Global Review、Deep Review。

- Change Review：审查当前变化及直接受影响代码。
- Global Review：审查变化后的整个项目状态，重点发现重复资产和架构问题。
- Deep Review：周期性进行全面的项目健康检查。

## 生命周期

```text
项目检测 -> Review Profile -> Change Review -> 验证 -> Global Review -> Commit Gate
```

普通开发优先 Change Review；提交前必须执行 Change Review + Global Review；项目治理时执行 Deep Review。

## 规则分层

```text
通用规则 + 语言规则 + 框架/运行时规则 + 项目规则
```

不同语言必须使用不同 Review 重点，不同框架必须使用框架语义审查。当前 V1 提供 TypeScript、Python、Go、Rust、Java，以及 React、NestJS 规则。

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

## 验证

从项目配置中找到真实存在的 Test、Lint、Typecheck、Build、Static Analysis 命令。禁止凭空发明项目命令。

## 严重程度

- BLOCKER：无法安全集成或严重生产/数据/安全影响。
- CRITICAL：严重且确认的缺陷或安全问题。
- HIGH：重要 Bug、回归、授权、一致性或架构违规。
- MEDIUM：实际风险、性能或维护问题。
- LOW：轻微质量问题。
- INFO：非阻断改进建议。

## Finding

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

审查范围和技术栈、按严重程度的问题、验证结果、Global Review 结果、最终结论 `PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`。
