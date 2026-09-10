---
name: git-conventions
description: 在用户明确要求创建或检查 Git 分支、提交、推送、rebase、merge 或生成 MR 描述时，按仓库约定提供检查和产物。仅用于 Git 工作流，不覆盖普通 Git 教学、只读查看或无关任务。
---

# Git 工作流

## 范围与优先级

- 本 Skill 提供 Git 工作流建议、检查结果和文本产物；它不是 Git Hook、CI 或远端权限系统，不能声称“强制阻止”仓库策略之外的操作。
- 用户的明确指令优先于本 Skill。仓库实际的 Hook、CI 和平台响应优先于默认建议；遇到冲突时说明证据，不要臆测。
- 只读检查可以直接执行。创建分支、提交、rebase、merge、push 等会改变状态的操作，只在用户已明确请求或授权时执行；用户只要求准备内容时不要执行变更。
- 不编造分支、Issue、commit、作者、来源或性能数据。无法确认时输出“未确认/未定位”和已执行的检查。
- 提交信息和 MR 描述中的人类可读内容默认使用中文；类型前缀、文件名、API、错误码、Issue/commit 标识、URL 和平台关键字保留原文。用户明确指定其他语言时遵循用户要求。
- 不把一次事故、某个远端 Hook 或某位用户的偏好扩展成所有仓库的通用规则。

## 路由

只读取当前任务需要的参考文件：

- 创建、命名或检查分支：读取 [references/branching.md](references/branching.md)。
- 暂存、生成提交信息或提交：读取 [references/commits.md](references/commits.md)。
- rebase、merge、push 或 force-push：读取 [references/merge-and-push.md](references/merge-and-push.md)。
- 生成或检查 MR 描述：读取 [references/mr-description.md](references/mr-description.md)。
- 需要判断仓库私有规则时：读取 [references/repo-policy.md](references/repo-policy.md)。

## 通用流程

1. 确认仓库根目录、当前分支、工作区状态和是否存在进行中的 rebase/merge/cherry-pick。
2. 读取适用的仓库规则，并区分“已验证规则”“用户约定”和“默认建议”。
3. 先完成已获授权的只读检查，形成具体的分支名、暂存路径、提交信息或 Git 命令。
4. 对状态或远端有影响的操作，核对精确 ref、目标仓库和目标分支；授权已经明确时不重复制造强制确认流程。
5. 执行后验证可观察结果，例如 `git status`、暂存 diff、commit 信息或远端 ref；失败时保留现场并说明下一步。
