---
name: leju_gitlab_operation
description: 通过乐聚 GitLab API（lejuhub.com）查看/管理 Issue（查看、添加/回复评论）、仓库分支（查看、创建、删除）、MR（查看、创建）以及待办事项。当用户需要查看 Issue、查看/添加/回复 issue 评论、管理分支/合并请求、查看待办事项时使用。也适用于提及 "issue"、"lejuhub"、"分支"、"MR"、"待办"、"todo" 等场景。
---

# 乐聚 GitLab 操作

通过 GitLab API v4 与 `www.lejuhub.com` 交互，支持 Issue 查看/评论、分支管理、MR 管理、待办事项功能。所有操作通过 `curl` 调用 GitLab API，执行前需确认环境配置。

## 前置条件

### 配置（token / API 地址）

乐聚配置（`GITLAB_API_TOKEN`、`GITLAB_API_URL`）的读取位置与读取命令**以 `leju_opts` 技能为唯一权威声明**，本技能不重复内嵌。执行任何 API 调用前：

1. 先调用 `leju_opts` 技能，按其说明读取 token；若返回空，按其"配置缺失时"指引处理
2. API 地址直接使用 `leju_opts` 的 `GITLAB_API_URL` 常量（`https://www.lejuhub.com/api/v4`），所有 curl 命令需携带 `--header "PRIVATE-TOKEN: <token>"`

### 项目自动识别

从当前 git 仓库的 remote URL 自动提取项目路径，URL 编码后作为 `PROJECT_ID`：

**Windows (PowerShell)：**

```powershell
$remoteUrl = $(git remote get-url origin)
# 示例: https://www.lejuhub.com/pc/kuavo-desktop.git
# 提取路径: pc/kuavo-desktop，URL 编码为 pc%2Fkuavo-desktop
$projectId = $remoteUrl -replace '^https?://[^/]+/', '' -replace '\.git$', '' -replace '/', '%2F'
```

**Linux/macOS (bash)：**

```bash
REMOTE_URL=$(git remote get-url origin)
PROJECT_ID=$(echo "$REMOTE_URL" | sed -E 's|https?://[^/]+/||; s|\.git$||; s|/|%2F|g')
```

若 git 命令不可用或提取失败，可根据 `git remote get-url origin` 输出手动指定 PROJECT_ID。

**验证项目可访问性**（token 按 `leju_opts` 技能方式读取）：

Windows (PowerShell)：
```powershell
$token = [System.Environment]::GetEnvironmentVariable("GITLAB_API_TOKEN", "User")   # 读取方式见 leju_opts 技能
curl -s --header "PRIVATE-TOKEN: $token" "https://www.lejuhub.com/api/v4/projects/$projectId" | Select-Object -First 1
```

Linux/macOS (bash)：
```bash
curl -s --header "PRIVATE-TOKEN: $GITLAB_API_TOKEN" \
  "https://www.lejuhub.com/api/v4/projects/$PROJECT_ID"
```

---

## Issue 管理

**默认行为：** 除非用户明确指定其他条件（如"所有 Issue"、"已关闭的"、"全部人的"），否则只查询当前用户未关闭的 Issue，按截止日期升序排列。

以下命令中，`$token` 已按 `leju_opts` 技能所述方式读取，`$projectId` 已通过项目自动识别方式获取，**切勿重复获取**。

### 2.1 查看 Issue 列表

**默认查询（我的 + 未关闭 + 按截止日期排序）：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues?scope=assigned_to_me&state=opened&order_by=due_date&sort=asc&per_page=30"
```

**查看所有未关闭的 Issue：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues?state=opened&order_by=due_date&sort=asc&per_page=30"
```

**按标签过滤：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues?scope=assigned_to_me&state=opened&labels=bug&order_by=due_date&sort=asc"
```

输出 Issue 的关键信息：`iid`、标题、类型（从 labels 中识别 `bug`/`feature`/`test` 等）、描述摘要、标签、指派人、截止日期、Web URL。按截止日期升序，已过期的排在最前面。

### 2.2 查看单个 Issue 详情

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues/$ISSUE_IID"
```

展示标题、描述、标签、指派人、里程碑、关联的 MR。

### 2.3 查看 Issue 评论

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues/$ISSUE_IID/notes?sort=asc&per_page=30"
```

输出每条评论的 `id`、作者、时间、内容。

> **安全规则：添加/回复 Issue 评论前，必须先向用户确认评论内容，待用户明确同意后方可执行 API 调用。严禁未经确认直接发送。**

### 2.4 添加 Issue 评论

在指定 Issue 下创建新评论：

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  --data-urlencode "body=<评论内容>" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues/$ISSUE_IID/notes"
```

执行后展示创建结果的 `id`、`body` 和创建时间，确认评论已添加。

### 2.5 回复 Issue 评论

回复指定 Issue 评论（即创建一条绑定到特定讨论的评论）。需要先通过 [2.3 查看 Issue 评论](#23-查看-issue-评论) 获取目标评论的 `id`，以该 `id` 作为 `discussion_id`：

**第一步：列出目标 Issue 的所有讨论，获取 discussion_id：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues/$ISSUE_IID/discussions?per_page=30"
```

输出每条讨论的 `id`（即 discussion_id）和第一条评论内容，从中找到需要回复的目标讨论。

**第二步：在指定讨论下回复：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  --data-urlencode "body=<回复内容>" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/issues/$ISSUE_IID/discussions/$DISCUSSION_ID/notes"
```

执行后展示创建结果的 `id`、`body` 和创建时间，确认回复已添加。

---

## 分支管理

以下命令中，`$token` 已按 `leju_opts` 技能所述方式读取，`$projectId` 已通过项目自动识别方式获取，**切勿重复获取**。

### 3.1 查看分支列表

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/repository/branches?per_page=30&search=<搜索关键词>"
```

`search` 参数可选，用于按分支名模糊搜索。默认列出最近更新的 30 个分支。

输出分支的 `name`、`merged` 状态、最后提交信息、最后更新时间。

**按保护状态过滤：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/repository/branches?protected=true&per_page=30"
```

### 3.2 查看单个分支

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/repository/branches/$( [uri]::EscapeDataString("<分支名>") )"
```

分支名需 URL 编码（含 `/` 的分支名如 `feat/xxx`）。

输出分支的 `name`、`protected`、`merged`、`commit` 详情、`web_url`。

### 3.3 创建分支

> **安全规则：创建分支前必须向用户展示完整的分支名和源分支，待用户明确同意后方可执行 API 调用。严禁未经确认直接创建。**

**执行创建分支前，必须先调用 `skill` 工具加载 `leju_git_conventions` 技能**，严格按照其分支命名规范（`userSlug/type/snake_keywords`）确定分支名，并完成重复检查后，再执行以下 API 调用：

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  --data-urlencode "branch=<按 leju_git_conventions 规范生成的分支名>" \
  --data-urlencode "ref=<源分支名>" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/repository/branches"
```

`ref` 为基准分支，先检测 `origin/dev` → `origin/beta` → `origin/master`，取第一个存在的行为默认源分支。用户可显式指定其他 ref。

输出新分支的 `name`、`commit` 信息，确认创建成功。

### 3.4 删除分支

> **安全规则：删除分支前必须先向用户确认分支名，待用户明确同意后方可执行。严禁未经确认直接删除。**

```bash
curl -s --request DELETE --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/repository/branches/$( [uri]::EscapeDataString("<分支名>") )"
```

分支名需 URL 编码。受保护分支无法通过 API 删除（需先取消保护）。

执行后返回 HTTP 204 表示删除成功。

---

## MR 管理

以下命令中，`$token` 已按 `leju_opts` 技能所述方式读取，`$projectId` 已通过项目自动识别方式获取，**切勿重复获取**。

### 4.1 查看 MR 列表

**默认查询（未关闭 + 按更新时间排序）：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=30"
```

**查看所有 MR（含已合并）：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=30"
```

**按源分支或目标分支过滤：**

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests?source_branch=<源分支>&target_branch=<目标分支>&state=opened"
```

输出 MR 的关键信息：`iid`、`title`、`source_branch` → `target_branch`、`state`、`author`、`web_url`。

### 4.2 查看单个 MR 详情

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests/$MR_IID"
```

展示标题、描述、源/目标分支、状态、作者、指派人、评审人、合并状态。

### 4.3 创建 MR

> **安全规则：创建 MR 前必须向用户展示完整的源分支、目标分支、标题和描述，待用户明确同意后方可执行 API 调用。严禁未经确认直接创建。**

**执行创建 MR 前，必须先调用 `skill` 工具加载 `leju_git_conventions` 技能**，严格按照其 MR 描述规范生成描述内容后，再执行以下 API 调用：

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  --data-urlencode "source_branch=<源分支>" \
  --data-urlencode "target_branch=<目标分支>" \
  --data-urlencode "title=<MR 标题>" \
  --data-urlencode "description=<MR 描述>" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests"
```

目标分支按 `origin/dev` → `origin/beta` → `origin/master` 优先检测，用户可显式指定。

输出 MR 的 `iid`、`web_url`，确认创建成功。

### 4.4 查看 MR 评论

```bash
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/projects/$projectId/merge_requests/$MR_IID/notes?sort=asc&per_page=30"
```

输出每条评论的 `id`、作者、时间、内容。

---

## 待办事项

待办事项（Todos）是 GitLab 自动为用户生成的待处理列表，当有人指派 Issue/MR 给你、在评论中提及你、或你的 MR 合并失败等场景时自动产生。**待办事项是用户级 API，与具体项目无关，无需 `$projectId`。**

以下命令中，`$token` 已按 `leju_opts` 技能所述方式读取，**切勿重复获取**。

### 5.1 查看待办事项列表

**默认查询（未完成 + 按创建时间降序），默认按以下三种条件分类展示：**

| 条件 | 对应 action | 说明 |
|------|------------|------|
| 分配给我的 | `assigned` | Issue/MR 指派给你 |
| 直接 @ 我的 | `mentioned` | 评论/描述中提及你 |
| 带有 `#delay` 标签 | — | 目标 Issue/MR 打了 `delay` 标签 |

> **说明：** GitLab Todos API 的 `action` 参数一次只能传单个值，且不支持按目标资源标签过滤。因此采用一次拉取全部 pending 待办，在本地按条件分类输出。

**Windows (PowerShell) — 综合查询（推荐）：**

```powershell
$token = [System.Environment]::GetEnvironmentVariable("GITLAB_API_TOKEN", "User")
$todos = curl -s --header "PRIVATE-TOKEN: $token" `
  "https://www.lejuhub.com/api/v4/todos?state=pending&per_page=50" | ConvertFrom-Json

# 分配给我的
$assigned = $todos | Where-Object { $_.action_name -eq "assigned" }
# 直接 @ 我的
$mentioned = $todos | Where-Object { $_.action_name -eq "mentioned" }
# 带有 delay 标签的（目标 Issue/MR 打了 delay 标签）
$delay = $todos | Where-Object { $_.target.labels -contains "delay" }

Write-Host "=== 分配给我的 ($($assigned.Count)) ==="
$assigned | ForEach-Object { Write-Host "#$($_.id) [$($_.target_type)] $($_.target.title) — $($_.target.web_url)" }

Write-Host "`n=== 直接 @ 我的 ($($mentioned.Count)) ==="
$mentioned | ForEach-Object { Write-Host "#$($_.id) [$($_.target_type)] $($_.target.title) — $($_.target.web_url)" }

Write-Host "`n=== 带有 #delay 标签 ($($delay.Count)) ==="
$delay | ForEach-Object { Write-Host "#$($_.id) [$($_.target_type)] $($_.target.title) — $($_.target.web_url)" }
```

**Linux/macOS (bash) — 综合查询：**

```bash
TOKEN="$GITLAB_API_TOKEN"
TODOS=$(curl -s --header "PRIVATE-TOKEN: $TOKEN" \
  "https://www.lejuhub.com/api/v4/todos?state=pending&per_page=50")

echo "=== 分配给我的 ==="
echo "$TODOS" | jq -r '.[] | select(.action_name == "assigned") | "#\(.id) [\(.target_type)] \(.target.title) — \(.target.web_url)"'

echo -e "\n=== 直接 @ 我的 ==="
echo "$TODOS" | jq -r '.[] | select(.action_name == "mentioned") | "#\(.id) [\(.target_type)] \(.target.title) — \(.target.web_url)"'

echo -e "\n=== 带有 #delay 标签 ==="
echo "$TODOS" | jq -r '.[] | select(.target.labels // [] | contains(["delay"])) | "#\(.id) [\(.target_type)] \(.target.title) — \(.target.web_url)"'
```

**单独按动作过滤（仅需某一类时使用）：**

```bash
# 仅查看指派给你的
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/todos?action=assigned&state=pending"

# 仅查看 @ 你的
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/todos?action=mentioned&state=pending"

# 仅查看待审批
curl -s --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/todos?action=approval_required&state=pending"
```

输出待办的关键信息：目标类型（Issue/MR）、动作（指派/提及/待审批）、目标标题、目标标签、所属项目、目标 URL。按三种条件分组展示，同一组内按时间降序。

### 5.2 标记待办为完成

```bash
curl -s --request POST --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/todos/$TODO_ID/mark_as_done"
```

`$TODO_ID` 为待办事项的 `id`（注意不是 iid，需从 [5.1 查看待办事项列表](#51-查看待办事项列表) 返回结果中获取）。

### 5.3 批量标记所有待办为完成

```bash
curl -s --request POST --header "PRIVATE-TOKEN: $token" \
  "https://www.lejuhub.com/api/v4/todos/mark_as_done"
```

> **安全规则：批量标记所有待办为完成是不可逆操作，执行前必须先向用户确认，待用户明确同意后方可执行。**

---

## 通用最佳实践

### 错误处理

所有 API 调用会返回 HTTP 状态码。常见错误：

| HTTP 状态码 | 原因 | 处理方式 |
|------------|------|---------|
| 401 | Token 无效或过期 | 提示用户重新生成 Token |
| 403 | 权限不足 | 确认 Token 的 `api` scope，或检查项目权限 |
| 404 | 项目/资源不存在 | 检查 PROJECT_ID 或资源 IID |

### 输出格式

Issue 列表以表格展示，包含标题、类型、描述摘要、截止日期：

```
| IID    | 标题                   | 类型   | 描述摘要                | 截止日期   |
|--------|------------------------|--------|-------------------------|------------|
| #2790  | 账号系统完整联调        | test   | 注册→登录→个人信息→退出  | 2026-07-13 |
| #2789  | 配额查询后端联调        | feat   | 用户中心配额与后端值一致  | 2026-07-13 |
```

### 命名速查

| 操作 | 命令关键词 |
|------|-----------|
| Issue 列表 | "查看 Issue"、"有哪些 issue" |
| Issue 详情 | "查看 Issue 详情"、"issue 详情" |
| Issue 评论 | "查看评论"、"issue 评论" |
| 添加 Issue 评论 | "添加评论"、"评论这个 issue" |
| 回复 Issue 评论 | "回复评论"、"回复这个评论" |
| 分支列表 | "查看分支"、"列出分支" |
| 单个分支 | "分支详情"、"查看分支 xx" |
| 创建分支 | "创建分支"、"新建分支" |
| 删除分支 | "删除分支" |
| MR 列表 | "查看 MR"、"MR 列表" |
| MR 详情 | "查看 MR 详情"、"MR 详情" |
| 创建 MR | "创建 MR"、"新建 MR"、"提 MR" |
| MR 评论 | "查看 MR 评论" |
| 待办列表 | "查看待办"、"待办事项"、"有哪些待办" |
| 标记待办完成 | "标记待办完成"、"完成待办" |
| 批量完成待办 | "全部完成"、"清空待办" |
