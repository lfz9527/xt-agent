# 深度审查（Deep Review）

Deep Review 用于周期性检查，不绑定单次变更。

## 目标

建立项目健康画像，发现长期积累的重复代码、架构漂移、死代码和技术栈碎片化。

## 检查范围

根据项目规模逐步建立资产索引：

- Components / UI
- Hooks / Composables
- Utilities / Helpers
- Types / Models / DTO / Schemas
- Services / UseCases
- API Clients / Endpoints
- Packages / Modules
- Dependencies
- Tests

## 检查方法

1. 识别项目语言和框架。
2. 建立可复用资产清单。
3. 按语言和框架选择语义分析方式。
4. 查找文本重复和语义重复。
5. 分析依赖图和模块边界。
6. 汇总高价值重构机会。

## 原则

Deep Review 的目标不是制造大量问题，而是找出真正值得治理的结构性问题。对于相似但职责合理的代码，应明确标记为“无需处理”或“不确定”，避免过度重构。

## 输出

- 项目健康摘要
- 高风险架构问题
- 高置信重复资产
- 可合并资产
- 技术栈碎片化
- Dead / obsolete code
- 推荐治理顺序
