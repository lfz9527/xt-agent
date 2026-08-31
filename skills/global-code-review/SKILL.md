# Global Review

> 默认使用中文。代码、API、错误信息和命令保持原文。

## 目标

从整个项目视角审查一次变化进入代码库后的影响，重点发现重复能力、架构退化、依赖碎片化和边界问题。

## 触发

适用于提交前、Merge Request 前和完成一组相关 Change Review 后。

## Review Scope

```text
Change
  ↓
项目资产扫描
  ↓
组件 / Hook / Utils / Service / Type / DTO / API / Module / Dependency
  ↓
语义关联与重复分析
  ↓
架构影响
```

Global Review 不只是重新审查 diff，而是判断变化后的项目整体状态。

## Preflight

识别项目语言、框架、Runtime，并加载 `../code-review-rules/` 下对应规则。项目级 Review 配置存在时一并加载。

## 核心检查

- 组件语义重复
- Hook / Composable 重复
- 工具函数重复
- Service / UseCase 重复
- 业务逻辑重复
- Type / DTO / Schema / Model 重复
- API / Client 重复
- IPC / Preload / Window 能力重复
- 模块边界与循环依赖
- 依赖碎片化
- Dead / obsolete code
- 新增代码造成的架构退化

重复判断以语义和职责为主，不只比较名称或文本。一个重复 Finding 至少提供两个位置和证据。

## Findings

按 `P0 / P1 / P2 / P3` 分级。同一问题只产生一个 Finding；多个位置统一列出。P0/P1 必须尽可能提供证据和 Confidence。

## Verification

使用项目实际可用的验证能力确认关键结论。不得虚构命令。

## 输出

中文总结、重复/架构 Findings、受影响资产、验证结果和最终结论：`PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`。
