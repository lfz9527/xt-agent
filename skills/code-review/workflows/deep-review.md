# 深度审查（Deep Review）

Deep Review 用于周期性检查，不绑定单次变更。

## 目标

建立项目健康画像，发现长期积累的重复代码、架构漂移、死代码和技术栈碎片化。

## 检查范围

Components/UI、Hooks/Composables、Utilities/Helpers、Types/Models/DTO/Schemas、Services/UseCases、API Clients/Endpoints、Packages/Modules、Dependencies、Tests。

## 流程

1. 识别语言和框架。
2. 建立可复用资产清单。
3. 按语言和框架选择分析方式。
4. 查找文本重复和语义重复。
5. 分析依赖图和模块边界。
6. 汇总高价值重构机会。

目标不是制造大量问题。相似但职责合理的代码应标记为无需处理或建议人工确认。
