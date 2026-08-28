# V1 规则进化预留

V1 暂不允许 Skill 自动修改自身规则。

本目录只记录规则进化的设计边界，避免后续实现破坏 Review 的稳定性。

## V1 原则

- Review 规则是版本化资产。
- Review 结果可以产生反馈，但反馈不会自动修改规则。
- 新规则或规则修改必须通过显式变更进入代码库。
- 项目经验可以沉淀为项目规则，但必须经过验证。
- 不允许因为单次误报/漏报直接改变规则。

## 后续版本

未来可以增加：

```text
Review Feedback
  -> Rule Proposal
  -> Evaluation
  -> Evolution Gate
  -> Rule Update
```

V1 只保留接口和设计位置，不实现自动进化。
