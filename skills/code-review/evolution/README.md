# V1 规则进化预留

V1 暂不允许 Skill 自动修改自身规则。

- Review 规则是版本化资产。
- Review 结果可以产生反馈，但不会自动修改规则。
- 新规则或规则修改必须通过显式代码变更进入仓库。
- 项目经验可以沉淀为项目规则，但必须经过验证。
- 不允许因为单次误报/漏报直接改变规则。

未来可以演进为：

```text
Review Feedback -> Rule Proposal -> Evaluation -> Evolution Gate -> Rule Update
```
