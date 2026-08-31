# Preflight Check

## 目的

在正式 Review 前确认项目、技术栈、规则和验证能力，避免 Agent 在上下文不足时直接给出审查结论。

## 检查顺序

1. 确认项目根目录和 Git 状态。
2. 确认当前分支和 Base。
3. 识别主要语言、框架和 Runtime。
4. 加载通用、语言、框架、项目规则。
5. 读取项目级 `code-review.yaml`、`code-review.rules.yaml`、`code-review.regex.yaml`（存在时）。
6. 执行 Regex / Pattern 等确定性快速检查。
7. 从项目配置中发现 Test、Lint、Typecheck、Build 等可用验证命令。
8. 确定本次 Review Scope。

## 规则

- 配置不存在时不得虚构配置。
- 无法确定语言或框架时，不得假装加载对应规则。
- 验证命令必须来自项目实际配置或可确认的工具链。
- Regex 命中应提供文件和行号等证据。
- Regex 命中本身不等于最终语义结论；需要结合上下文判断。
- 疑似敏感信息等高风险命中，应标记为需要人工确认，除非证据足以支持更高优先级。
- Preflight 发现的问题进入正式 Review Findings，并遵循统一 P0/P1/P2/P3 体系。

## 输出

Preflight 结束后至少记录：

```text
项目：
分支：
Base：
语言：
框架：
规则：
Regex：
验证能力：
Review Scope：
Preflight 状态：PASS / WARN / BLOCK
```
