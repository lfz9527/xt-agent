# Product artifact reference

Use this reference only for requests that need detailed structures or a consistent evaluation rubric. Adapt the sections to the decision; omit empty sections instead of filling them with generic text.

## PRD template

```markdown
# [产品/能力名称]

## 0. 摘要与决策
- 一句话：
- 本次需要决定：
- 推荐方案：
- 置信度：高 / 中 / 低

## 1. 背景与问题
- 目标用户与场景：
- 当前做法/替代方案：
- 用户问题与影响：
- 为什么现在：

## 2. 目标与非目标
### 目标
### 非目标

## 3. 用户与关键流程
- 用户故事：
- 主流程：
- 关键状态：空、加载、成功、失败、重试、取消、权限不足等

## 4. 方案与范围
- 方案概述：
- 备选方案与取舍：
- MVP 范围：
- 后续范围：

## 5. 需求
| ID | 需求 | 优先级 | 用户价值/理由 | 验收标准 | 未决项 |
|---|---|---|---|---|---|

## 6. 指标与验证
- 结果指标：
- 先行指标：
- 护栏指标：
- 基线/目标/时间窗：
- 验证方式：

## 7. 风险、依赖与假设

## 8. 发布与反馈
- 发布门槛：
- 灰度与监控：
- 反馈渠道：
- 回滚触发条件：

## 9. 决策与下一步
```

## Requirement and acceptance rubric

Before delivering, check that each high-priority item:

1. identifies a user or system actor and a meaningful outcome;
2. has one primary behavior rather than several bundled behaviors;
3. can be verified by observable evidence;
4. names relevant constraints, permissions, states, and failure behavior;
5. links to a goal or metric;
6. does not hide an unresolved product decision as an implementation detail.

Acceptance criteria should describe externally observable behavior. Prefer a few decisive criteria over exhaustive test cases. Example:

```text
Given 用户已登录且有权限
When 用户提交一个有效的唯一名称
Then 系统创建记录并显示成功状态
And 刷新页面后记录仍可见
```

Add separate criteria for invalid input, duplicate submission, timeout/retry, and permission failure when those cases alter the experience.

## Prioritization worksheet

Use a single common scale for all candidates. A lightweight RICE worksheet is:

```text
RICE = Reach × Impact × Confidence ÷ Effort
```

Record the unit and time window for Reach, define Impact levels before scoring, express Confidence as a percentage or band, and define Effort in comparable person-weeks or team-weeks. If inputs are weak, show low/base/high scenarios and explain whether the ordering changes. Replace RICE with impact-effort or cost-of-delay when the data does not support a numerical estimate.

## Metrics worksheet

For each metric, record:

| Metric | Definition/event | Population | Baseline | Target | Time window | Direction | Owner |
|---|---|---|---|---|---|---|---|

Do not call a proxy the North Star without explaining the relationship to user value. Pair growth metrics with guardrails such as quality, latency, abuse, support burden, retention, or accessibility when relevant.

## Discovery questions

Use only the questions that can change the decision:

- Which user segment and job are in scope, and who is explicitly out of scope?
- What evidence supports the problem: observed behavior, interviews, support tickets, funnel data, or a stakeholder hypothesis?
- What outcome must improve, by how much, and by when?
- What constraints are fixed: legal, privacy, platform, budget, staffing, compatibility, or deadline?
- What is the smallest test that can disconfirm the preferred solution?
- What happens if we do nothing, and what must be true before expanding scope?
