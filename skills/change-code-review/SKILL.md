---
name: change-code-review
description: 审查指定 Git diff、提交或 MR 变更及其直接影响，发现可证实的 Bug、安全、回归、兼容性和测试问题；不用于全项目健康审查或单独的迁移实现。
---

# Change Code Review

> 默认使用中文。代码、API、错误信息、命令和原始标识符保持原文。

## 适用范围

用户要求审查工作区变化、暂存区、指定 commit/range、提交前变更或 MR diff 时使用。

以下请求不应单独触发本 skill：

- 只要求全项目技术债、架构健康或长期治理：使用 deep-code-review；
- 要求判断一次变更与项目已有能力、模块边界或依赖的整体关系：追加 global-code-review；
- 只要求解释代码、实现功能、写迁移或修复问题而未要求 Review。

## 工作流

1. 读取[共享审查协议](../../code-review-rules/review-protocol.md)。
2. 确认 review target：
   - 使用用户指定的 commit、range、MR 或 base；
   - 未指定时检查 git status、暂存区、未暂存 diff 和相关未跟踪文件；
   - 记录 Base、Target、分支、变更文件和范围限制。
3. 读取项目级约束、语言/框架识别结果、变更文件完整内容、测试变化和必要的直接调用链。
4. 从仓库根目录加载 code-review-rules/ 下的 Universal、Language、Framework 和可识别的项目规则；记录缺失或未加载的规则。
5. 按风险检查：
   - 行为正确性、边界输入、错误传播和异步/并发；
   - API、类型、数据和配置兼容性；
   - 认证/授权、输入到敏感操作的数据流、依赖和敏感信息；
   - 性能、资源生命周期、测试是否能捕获回归；
   - 变更是否违反项目已有约束。
6. 只对有证据的问题建立 Finding。若问题需要搜索项目已有实现、跨模块关系或依赖图，停止扩大本次范围，标记并建议追加 global-code-review。
7. 从项目实际配置中发现并执行最小相关验证；如未执行或命令不存在，按共享协议报告 NOT_RUN 或 N/A。
8. 使用[报告模板](../../code-review-rules/review-report.md)输出中文总结、统一 Findings、验证结果和 PASS / PASS_WITH_WARNINGS / REQUEST_CHANGES。

## 重点约束

- 不默认扫描整个项目，不把未确认的可能性写成确定性高优先级问题。
- 一个根因只输出一个 Finding；多个文件统一放入“受影响位置”。
- P0/P1 必须有直接代码路径、复现结果、配置事实或其他明确证据，并填写置信度。
- 代码风格偏好只能作为 P3 建议，除非项目规则明确要求。
- Review 默认只读，不切换分支、不修改代码、不提交、不推送、不自动安装依赖。
