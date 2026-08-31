# Change Code Review

> 默认使用中文。代码、API、错误信息和命令保持原文。

## 目标

审查当前代码变化是否正确、安全、可测试，并识别由本次变化直接引入的问题。

## 触发

适用于开发过程中的单次变更、提交前快速审查和指定 diff 审查。

## Review Scope

```text
Git Diff
  ↓
Changed Files
  ↓
受影响函数 / 类 / 模块
  ↓
必要时追踪直接调用方与被调用方
```

不要默认扫描整个项目；如果发现需要全局分析的问题，输出建议运行 `global-code-review`。

## Preflight

先识别项目语言、框架、Runtime，并加载 `../code-review-rules/` 下对应的 Universal、Language、Framework 规则。项目根目录存在 `code-review.yaml`、`code-review.rules.yaml` 或 `code-review.regex.yaml` 时一并加载。

## 检查重点

- Correctness / Bug
- Security
- Error Handling
- Async / Concurrency
- Type Safety
- API Compatibility
- Data Consistency
- Performance
- Tests
- Maintainability
- 项目约束

## Findings

按 `P0 / P1 / P2 / P3` 分级。同一问题只产生一个 Finding；多个位置统一列出。P0/P1 必须尽可能提供证据和 Confidence。

```text
[P1-1] 标题
类型：Security
位置：file:line
问题：
影响：
证据：
建议：
Confidence：0.00-1.00
```

## Verification

优先执行项目真实存在的 Test、Lint、Typecheck、Build 或 Static Analysis。不得虚构命令。

## 输出

中文总结、P0/P1/P2/P3 Findings、验证结果和最终结论：`PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`。
