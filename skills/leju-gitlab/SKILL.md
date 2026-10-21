---
name: leju-gitlab
description: 用于操作由环境变量 `LEJU_GITLAB_URL` 配置的 GitLab 社区版 15.10.8 实例。用户请求涉及乐聚 GitLab 时使用，包括项目、Issue、Merge Request、分支、Tag、Pipeline 和仓库文件操作。
---

# 乐聚 GitLab 15.10.8

使用 `leju_gitlab` MCP 工具执行用户请求的 GitLab 操作。

## 调用方式

- 将 `$leju-gitlab` 后面的文本视为操作及其参数。
- 如果调用 `$leju-gitlab` 时未提供操作，则使用 `{}` 调用 `mcp__leju_gitlab__gitlab_health_check`。
- 对于健康检查请求，直接调用 `mcp__leju_gitlab__gitlab_health_check`；不要索要项目 ID。

## 工具路由

- 选择匹配的 `mcp__leju_gitlab__gitlab_*` 工具，并提供所有必需参数。
- 缺少必需的项目 ID、Issue IID、合并请求 IID、分支或文件路径时，只询问缺失的值。
- 使用读取工具进行检查和获取。只有用户明确请求相应变更时，才执行写入操作。
- 除非用户明确要求其他方案，否则不要用 curl、浏览器操作或猜测结果替代 MCP 调用。

## 结果处理

- 用简洁的中文报告实际 MCP 结果，包括相关标识符和状态。
- 未获得成功的工具结果时，绝不声称操作成功。
- 如果 MCP 调用失败，报告准确的失败信息并停止；不要静默回退。
- 不要泄露访问令牌、凭据或其他身份验证材料。

示例：

- `$leju-gitlab` → 检查乐聚 GitLab 的连接，并报告已认证用户和 GitLab 版本。
- `$leju-gitlab 列出我可以访问的项目` → 调用乐聚 GitLab 项目列表工具。
- `$leju-gitlab 查看项目 group/project 的开放 Issue` → 使用提供的项目和筛选条件调用 Issue 列表工具。
