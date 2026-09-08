---
name: private-gitlab
description: Use the private_gitlab MCP to perform private GitLab operations when the user invokes $private-gitlab or explicitly asks to use the private GitLab connection.
---

# Private GitLab

Use the `private_gitlab` MCP tools for the user's requested GitLab operation.

## Invocation

- Treat the text after `$private-gitlab` as the operation and its parameters.
- If `$private-gitlab` is invoked without an operation, run `mcp__private_gitlab__gitlab_health_check` with `{}`.
- For a health check request, call `mcp__private_gitlab__gitlab_health_check` directly; do not ask for a project ID.

## Tool routing

- Select the matching `mcp__private_gitlab__gitlab_*` tool and provide all required arguments.
- If a required project ID, issue IID, merge request IID, branch, or file path is missing, ask only for the missing value.
- Use read tools for inspection and retrieval. Perform write operations only when the user explicitly requests the corresponding change.
- Do not replace the MCP call with curl, browser actions, or a guessed result unless the user explicitly asks for an alternative.

## Result handling

- Report the actual MCP result concisely in Chinese, including the relevant identifiers and status.
- Never claim success without a successful tool result.
- If the MCP call fails, report the exact failure and stop; do not silently fall back.
- Do not reveal access tokens, credentials, or other authentication material.

Examples:

- `$private-gitlab` → check private GitLab connectivity and report the authenticated user and GitLab version.
- `$private-gitlab 列出我可以访问的项目` → call the private GitLab project-list tool.
- `$private-gitlab 查看项目 group/project 的开放 Issue` → call the issue-list tool with the supplied project and filters.
