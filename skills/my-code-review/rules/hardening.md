# V1 Hardening Rules

## Review Language

- Review 报告默认使用中文。
- 代码、类名、函数名、变量名、API、错误日志和命令输出保持原文。
- 除非用户明确要求，否则不输出整篇英文 Review。

## Priority

```text
🟥 P0 · 致命
🟧 P1 · 严重
🟨 P2 · 一般
⬜ P3 · 建议
```

- P0/P1 为提交门禁问题。
- P2/P3 默认非阻断。
- 同一优先级内使用 `P0-1`、`P0-2`、`P1-1` 等编号。
- 编号仅在当前 Review 内有效。

## Finding

- Type 与 Priority 必须分离。
- 同一个问题只能产生一个 Finding。
- 同一问题影响多个位置时统一列入受影响位置。
- 高优先级问题必须尽可能提供代码、调用关系、测试、配置或验证结果等证据。
- 不确定的问题应降低优先级并提供 Confidence，必要时要求人工确认。
- 不得因为个人代码风格偏好将问题提升为 P0/P1。

## Rule Layers

规则按以下层级组合：

```text
Universal
  ↓
Language
  ↓
Framework
  ↓
Project
```

项目规则可以补充或覆盖更通用的规则，但不得无依据地虚构项目规则。

## Preflight

正式 Review 前必须完成 Preflight，确认项目、技术栈、规则、Regex 和验证能力。

确定性规则优先使用 Regex / Pattern 等机械检查；语义问题交由 Review Agent 判断。
