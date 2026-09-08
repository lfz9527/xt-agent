# 私有化 GitLab MCP

这是一个通过 GitLab REST API v4 操作私有化 GitLab 的本地 stdio MCP 服务。服务从项目根目录的 .env 或进程环境变量读取实例地址和 token，不在仓库保存凭据；进程环境变量优先。

## 能力

- 连通性、当前用户、GitLab 版本
- 项目查询
- Issue 查询、创建、更新、评论
- Merge Request 查询、创建、更新、评论
- 分支查询
- 仓库文件读取、单文件创建或更新提交

项目 ID 同时支持数字 ID 和 group/project 路径。写操作可通过 GITLAB_READ_ONLY=true 全局禁用。

## 本地运行

Node.js 20 或更高版本：

~~~powershell
Copy-Item .env.example .env
# 编辑 D:\xt-agent\mcp\private-gitlab\.env，填写 GITLAB_URL 和 GITLAB_TOKEN

npm install
npm run typecheck
npm test
npm run build
npm start
~~~

stdio 服务启动后不会向 stdout 打印普通日志，日志写入 stderr，以免破坏 MCP 协议流。

## 接入 Codex

本项目安装脚本会将 D:\xt-agent\mcp\private-gitlab 建立到 C:\Users\13971\.codex\mcp\private-gitlab 的目录 Junction，并输出需要合并到 Codex config.toml 的片段：

~~~powershell
.\scripts\install-codex.ps1
~~~

建议在启动 Codex 前设置用户环境变量：

~~~powershell
[Environment]::SetEnvironmentVariable('GITLAB_URL', 'https://gitlab.example.local', 'User')
[Environment]::SetEnvironmentVariable('GITLAB_TOKEN', 'replace-with-a-token', 'User')
~~~

设置后需要重启 Codex，使新进程继承环境变量。不要把真实 token 写入 config.toml 或提交到 Git。
