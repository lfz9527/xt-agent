# 提交审查（Commit Review）

Commit Review 是提交前质量门禁。

```text
工作区变化 -> Change Review -> 修复阻断问题 -> 验证 -> Global Review -> 修复结构问题 -> 再次验证 -> Commit
```

## 必须执行

1. 没有未处理的 BLOCKER / CRITICAL。
2. HIGH 已修复，或明确获得项目级豁免。
3. 执行项目已有的测试、Lint、Typecheck、Build 等验证。
4. 执行 Global Review，重点检查新增代码是否重复已有组件、工具函数、类型、服务或业务逻辑。
5. 检查新增依赖是否造成不必要的技术栈碎片化。
6. 输出 Commit Gate 结论。

## Gate

`PASS` / `PASS_WITH_WARNINGS` / `REQUEST_CHANGES`

只有不存在未豁免的阻断问题时才能返回 PASS。
