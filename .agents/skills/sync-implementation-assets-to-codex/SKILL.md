---
name: sync-implementation-assets-to-codex
description: 将当前项目中与代码实现直接相关的 skills 增量接入 Codex，并把同级 xt-harness-agent/mcp 服务链接到 Codex、配置到项目级 .codex/config.toml。用户要求同步实现类技能或项目 MCP 时使用。
---

# 将实现类资源增量接入 Codex

## 目标

把当前项目 `skills/` 中明确服务于代码编写、修改、调试、测试、构建、代码审查或数据库结构实现的 skill，增量链接到项目级 `.agents/skills/`；把同级 `xt-harness-agent/mcp/` 中的 MCP 服务安装到 Codex，并将服务配置合并到项目级 `.codex/config.toml`。

## 路径

- 项目根目录：当前工作区根目录。
- Skills 来源：`<项目根目录>/skills/`。
- Skills 目标：`<项目根目录>/.agents/skills/`，这是 Codex 项目级 skills 目录。
- MCP 来源：项目根目录同级的 `xt-harness-agent/mcp/`。
- MCP 服务器链接目标：`$env:USERPROFILE\.codex\mcp\<服务名>`。
- MCP 配置目标：`<项目根目录>/.codex/config.toml`。不得改写用户级 `$env:USERPROFILE\.codex\config.toml`。

## 流程

1. 先读取项目规则、来源目录中的 `SKILL.md` 和 MCP 服务的 `README`、`codex.mcp.toml.example`、`scripts/install-codex.ps1`。不要读取或输出任何 `.env` 文件内容。
2. 检查目标目录和现有 Codex 配置。保留已有内容，识别已正确链接项、冲突项和失效链接；不得覆盖目标中已有的文件、目录或链接。
3. 逐个阅读候选 skill 的说明，只有明确直接用于代码实现的才纳入。代码审查、调试、测试、构建和数据库结构实现可纳入；项目汇报、任务记录、状态管理、需求流程或通用业务操作不纳入。边界不清时跳过并在结果中列出候选项，不按名称猜测。
4. 对未接入的 skill 目录创建指向来源目录的目录符号链接。只处理直接子目录且必须包含 `SKILL.md`；不复制或修改来源文件。
5. 对每个 MCP 服务优先复用其 `scripts/install-codex.ps1`。先阅读脚本，确认源路径、目标路径和冲突行为，再运行。脚本会在用户级 Codex MCP 目录创建目录 Junction；如目标已存在或脚本行为与预期不符，停止处理该项并报告，不覆盖目标。
6. 将各服务示例中的 MCP 项合并到项目级 `.codex/config.toml`，保留现有配置和其他服务项。若配置文件不存在，可创建目录和文件；若同名服务项已存在则比较后保持一致或报告冲突，不重复追加。不要将密钥、令牌或 `.env` 内容写入 TOML；沿用示例中的环境变量引用。
7. 核验每个新增链接解析到预期来源，skill 目标包含 `SKILL.md`，MCP 目标包含服务文件，并检查 TOML 仅含所需的 MCP 项。

## 完成报告

简要列出新增链接、已存在项、因冲突跳过的项、排除或待确认的 skills，以及新增或已存在的 MCP 配置项。说明 MCP 服务器目录使用的是 Junction。不得声称未实际核验的链接或配置已成功。
