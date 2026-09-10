# 暂存与提交

## 暂存前

先查看工作区和差异：

```text
git status --short
git diff --name-status
git diff --cached --name-status
```

## `git add` 约定（强制）

- 每个文件必须单独执行一次 `git add`；一条命令只能包含一个文件路径。
- 禁止使用 `git add .`、`git add *`、`git add -A`、`git add --all`、目录路径，或在同一条命令中传入多个文件。
- 多个文件必须展开为多条命令，例如：

```text
git add -- src/feature.ts
git add -- tests/feature.test.ts
git add -- docs/feature.md
```

`.env*`、日志、密钥、生成目录和临时文件应作为风险候选检查；不要因为文件名包含 `backup`、`copy` 或 `tmp` 就静默丢弃用户明确指定的已跟踪文件。

默认不使用 `git add -f` 添加被忽略文件；只有仓库策略和用户明确要求都允许时才考虑。暂存后必须核对：

```text
git diff --cached --name-status
git diff --cached --check
git diff --cached --stat
```

## 提交信息

### 输出语言（强制）

- 提交主题和正文中的人类可读内容必须使用中文；如果输入材料是英文，先翻译后输出。
- `feat`、`fix` 等类型前缀，以及文件名、函数名、API 名、错误码、Issue/commit 标识、URL 和命令保留原文，不为追求中文而翻译或改写。
- 只有用户明确指定其他语言，或仓库已验证存在更高优先级的语言规范时，才改变中文默认值。

默认格式：

```text
<type>: <简短主题>

- <必要时的变更或原因>
- <必要时的变更或原因>
```

- 主题长度、语言、类型集合以仓库规则为准；没有规则时建议主题不超过 72 个字符。
- 正文不是固定必需项。变更简单时可以省略；变更复杂或仓库要求时写 3-6 条，内容必须来自实际 diff，并说明影响或原因。
- 不改写真实的作者、依赖、工具或来源信息来满足未经验证的禁词规则。
- 一次提交应保持一个清晰目的；如果存在互不相关的变更，先建议拆分，但不要擅自重排用户工作区。

PowerShell 多行消息可以这样传递：

```powershell
$msg = @'
feat: 示例主题

- 说明实际变更及其原因
'@
git commit -m $msg
```

如果用户只要求生成提交信息，只输出信息，不执行 commit。如果用户已明确要求提交，执行前报告将要提交的路径和完整信息；不额外强制依赖某个询问工具或重复确认步骤。

## 提交后验证

检查 `git show --stat --oneline HEAD`、`git status --short`，并确认提交没有包含意外路径。提交失败时保留工作区现场，不通过 reset 或清理命令“修复”现场。
