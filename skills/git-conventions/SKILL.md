---
name: git-conventions
description: 强制执行 Git 工作流规范，包括分支命名、提交信息、自动提交过滤和合并请求描述。在用户要求创建分支、切换分支、提交代码、编写提交信息、创建合并请求或执行任何涉及分支/提交/MR 的 Git 操作时使用。自动验证并阻止不符合规范的操作 —— 切勿跳过这些检查。
---

# Git 规范

执行 Git 操作时自动应用以下规则。如果任何操作违反规则，阻止该操作并告知用户原因，然后建议正确的做法。

## 1. 确定用户标识 (userSlug)

创建分支前，先确定用户标识：

```bash
git config user.name
```

转换为小写，空格替换为下划线，仅保留 `[a-z0-9_]`。如果结果为空或不明确，向用户询问其标识（例如 `lfz`、`jhs`）。

## 2. 分支命名

### 格式

```
<userSlug>/<type>/<snake_keywords>
```

关键字**必须**使用下划线 `_` 作为分隔符。短横线 `-` 会被远程 pre-receive hook 拒绝并导致推送失败 —— 即使仓库中看起来允许短横线，这条规则也不可协商。

### 类型选择

选择与变更匹配的**最高优先级**类型。优先级顺序：

```
bug > fix > perf > ui > style > util > deploy > release > docs > feat > refactor > test > ci > chore > build
```

使用以下启发式规则选择类型：

| 类型 | 适用场景 |
|------|----------|
| `bug` | 线上故障、崩溃、panic、数据错误、安全问题（紧急修复） |
| `fix` | 普通 Bug 修复、回滚、热修复补丁、异常处理修正 |
| `ui` / `style` | CSS/SCSS 文件、styles/ 目录、设计令牌、动画、过渡效果 |
| `perf` | 缓存、memo、防抖、节流、帧率优化、懒加载、批处理 |
| `deploy` / `release` | Dockerfile、docker-compose、helm、CI 工作流 (.github/workflows)、构建配置 |
| `docs` | Markdown 文件、docs/ 目录、README |
| `util` | utils/、lib/、shared/、hooks/、common/ 目录 |
| `feat` | 新功能（无更高优先级匹配时的默认选项） |
| `refactor` | 重构、重命名、提取公共逻辑、模块拆分/合并 |
| `test` | 测试文件、测试用例、测试基础设施、fixtures |
| `ci` | CI 流水线、构建脚本、GitHub Actions/Jenkins 配置 |
| `chore` | 依赖更新、脚本工具、杂项维护 |
| `build` | 构建系统、打包配置（webpack/vite/rollup）、编译选项 |

### 关键字规则

- 2-5 个单词，仅允许 `[a-z0-9_]`，用 `_` 连接
- 禁止短横线、大写字母、空格或中文字符
- 中文需转换为英文词汇或无音调拼音
- 分支名总长度 ≤ 50 个字符
- 避免嵌套斜杠（userSlug 后最多一个 `/`）

### 示例

```
lfz/feat/settings_drawer_refactor
lfz/fix/app_json_init_error
lfz/ui/login_form_animation
```

### 重复检查

创建分支前，检查是否已存在同名分支：

```bash
git rev-parse --verify --quiet <branch> 2>/dev/null
```

如果已存在，警告用户并建议替代关键字。

同时检查远端是否已有同名分支：

```bash
git ls-remote --heads origin <branch>
```

如果远端已存在（即使本地没有），同样警告并建议替代关键字，避免推送时冲突。

## 3. 提交信息

### 格式

```
<type>: <简短主题>
<空行>
- <要点 1>
- <要点 2>
- <要点 3>
```

主题行总长度 ≤ 72 个字符（`<type>: ` + 主题内容）。

### 提交类型

提交可使用完整类型集：

```
feat | bug | fix | ui | docs | style | util | perf | release | deploy
refactor | test | ci | chore | revert | merge | build | wip
```

### 要点 (3-6 条)

每条要点必须：
- 以描述实际操作的动词开头
- 具体明确：指明涉及的模块、文件、接口或错误码
- 从实际差异中提炼 —— 描述真实的变更及其范围

### 规则

- **一次提交只做一件事。** 如果变更涉及不相关的领域，拆分为独立提交。
- **解释"为什么"，而非"是什么"。** diff 已经展示了改了什么，提交信息应该说明改动的原因。
- **剔除 `anthropic`/`claude` 关键字** —— 这些不应出现在提交信息中。
- **提交信息统一使用中文。** 主题行和要点均用中文撰写，专有名词（API 名、错误码、文件名）保留原文。

### 示例

**PowerShell（当前环境）：**

```powershell
$msg = @'
feat: 版本管理设置面板与配置项更新

- 抽离 SettingsDrawer 逻辑至独立组件，避免后续新增设置项时主组件持续膨胀难以维护
- 修复 app.json 缺失字段导致新用户首次启动白屏（ERR-1201），根因是初始化时未做字段缺省处理
- 键盘事件未做防抖，高频输入时触发 30+ 次重渲染，引入 debounce 后首页首帧 +12%
'@
git commit -m $msg
```

> **关键约束**：PowerShell 下必须先用 `$msg = @'...'@` 变量承接多行消息，再 `git commit -m $msg`。禁止直接在 `-m` 后拼接 here-string（如 `git commit -m @'...'@`），这会导致消息首尾被注入 `@` 字符。
>
> `'@` 必须顶格（列0），内容从 `@'` 下一行开始。

**Bash（备用）：**

```bash
git commit -m "feat: 版本管理设置面板与配置项更新

- 抽离 SettingsDrawer 逻辑至独立组件，避免后续新增设置项时主组件持续膨胀难以维护
- 修复 app.json 缺失字段导致新用户首次启动白屏（ERR-1201），根因是初始化时未做字段缺省处理
- 键盘事件未做防抖，高频输入时触发 30+ 次重渲染，引入 debounce 后首页首帧 +12%"
```

### 提交前自动过滤

禁止使用 `git add .` 或者`git add *` 或 `git add -A`。始终先过滤再明确暂存各个文件，排除以下内容：

- 已被 `.gitignore` 忽略的文件（禁止通过 `-f` 强制添加）
- 文件名含 `copy`、`backup`、`temp`、`tmp` 的文件
- 以 `_` 开头的目录
- `dist/`、`build/`、`node_modules/`
- `.env*`、`*.log`、`.DS_Store`、`Thumbs.db`
- `.vscode/`、`.idea/`、`.claude`
- `.gitignore`（仅在本次变更确实需要新增或调整忽略规则时才暂存，需在 commit message 中注明原因）

### 提交流程

```
1. git status                    → 检查工作区状态
2. 分析并过滤                    → 从暂存列表中排除不应提交的文件
3. git add <file1> <file2> ...   → 逐个暂存文件
4. git status                    → 确认暂存文件正确
5. 生成提交信息                  → 按规范格式生成完整的 commit message
6. 用户确认                      → 将生成的 commit message 展示给用户确认
7. $msg = @'...'@; git commit -m $msg  → 用户确认后执行提交（PowerShell 必须用变量承接）
```

### 提交前确认

在生成 commit message 之后、执行 `git commit` 之前，**必须**将完整的提交信息展示给用户，使用 AskUserQuestion 工具让用户确认：

- **确认无误** → 用户选择"确认提交"后，执行 `git commit`
- **需要修改** → 用户选择"需要修改"，然后根据用户要求调整 commit message，调整后再次展示确认，直到用户满意为止
- **取消提交** → 用户选择"取消"，终止提交流程，不执行 commit

确认时仅展示完整的 commit message（主题行 + 要点列表），无需列出提交文件或排除文件。

此确认步骤**不可跳过** —— 即使用户说"直接提交"或"不用确认"，也必须执行。

## 4. 合并请求描述（通用格式）

### MR 标题

MR 标题沿用分支的 `<type>: <简短描述>` 格式，与 commit 主题行一致。如需标记为草稿或 WIP，加 `Draft:` 前缀：

```
fix: 修复登录页面 token 过期后未跳转登录页
Draft: feat: 新增用户权限管理面板
```

### 修复类

当 MR 标题包含 `fix:`、`bug:`、`hotfix:` 或 `修复` 时，描述**必须**包含以下结构化字段：

```
类型：修复问题
问题现象：[具体表现 — what the user sees going wrong]
问题原因：[根本原因 — the root cause]
修复方案：[修复方案 — how this MR fixes it]
引入问题：commit <commit hash>，author <作者名>；如果暂时无法定位，需要说明已尝试的定位方式和当前判断。
```

缺少任一字段，或使用关键词但不带 `字段名：` 格式均为无效。

### 查找引入来源（Source Commit）

来源必须是**已合并到 beta/master 的提交** —— 绝不能引用当前 MR 内的提交。

1. 找到引入问题代码的提交：
   ```bash
   git log -S '<关键代码符号>' -- <file>
   git blame <file> -L <start>,<end>
   ```
2. 确认该提交在 beta/master 上：
   ```bash
   git log origin/beta --oneline -- <file>
   git branch -r --contains <commit>
   ```
3. 列出找到的提交及其 hash。

**多个根本原因** → 逐一列出每个提交及其引入的问题。

**Bug 在当前 MR 内部引入** → 不要列自身提交作为来源；应追溯到最初的实现提交，或如实声明："问题在本 MR 内部引入并修复"。

**严禁**接受"历史遗留"、"未知"、"初版对接"等模糊说法作为唯一来源。它们可以作为真正 commit hash 的补充，但不能替代。

### 查找责任人 (Responsible Person)

责任人是**引入提交的作者**：

```bash
git log -1 --format='%an <%ae>' <commit>
```

- 绝不要默认填入当前 MR 作者 —— 如果结果碰巧相同，注明："（@xxx 是 <commit> 的作者）"以证明是推导而非假定。
- 多个提交不同作者 → 全部列出。同一作者 → 只列一次。

## 5. 合并请求描述（功能/需求类）

当 MR 标题包含 `feat:` 时，描述**必须**包含以下结构化字段：

```
类型：实现需求
需求目标：[引用需求、需求评审 MR 或产品说明，说明这次要实现哪一项能力，以及希望达到什么效果]
需求原因：[说明为什么要做这个需求，它解决什么业务问题、协作问题或使用体验问题]
实现方案：[按照自己对需求的理解梳理落地思路，不要只罗列改了哪些文件或者函数]

Closes [关联的 issue 号或链接，如 #123 或完整 URL]
```

缺少任一字段，或使用关键词但不带 `字段名：` 格式均为无效。

### 从提交记录生成描述

生成 feat 类 MR 描述前，先确定当前项目的目标分支，再读取当前用户在当前分支上的提交记录：

```bash
# 获取当前分支名
git branch --show-current
# 获取当前用户
git config user.name
# 确定目标分支（按优先级检测远程是否存在）
git ls-remote --heads origin beta   # 存在则用 origin/beta
git ls-remote --heads origin main   # 其次 origin/main
git ls-remote --heads origin master # 最后 origin/master
# 仅筛选当前用户的提交（含完整提交信息和变更文件）
git log <target>..HEAD --no-merges --author="<user.name>" --format="%H %s%n%b"
# 查看每个提交的变更文件列表及统计
git log <target>..HEAD --no-merges --author="<user.name>" --stat
# 查看每个提交的完整 diff
git diff <target>..HEAD
```

目标分支按 `origin/beta` → `origin/main` → `origin/master` 优先级检测，使用当前项目中第一个存在的远程分支。`--author` 仅匹配当前 `git config user.name`。

**仅提取当前用户的提交生成 MR 描述**，忽略其他协作者的提交。`--author` 参数匹配 `git config user.name` 的返回值。

同时读取每个提交的完整内容和变更 diff。从**提交信息正文**（不只是主题行）和**实际代码变更**中提炼字段内容：

- 需求目标：引用需求、需求评审 MR 或产品说明，说明这次要实现哪一项能力，以及希望达到什么效果
- 需求原因：说明为什么要做这个需求，它解决什么业务问题、协作问题或使用体验问题。
- 梳理落地思路，不要只罗列改了哪些文件或者函数

### 生成流程

```
1. git branch --show-current                              → 获取当前分支名，提取 issue 号
2. git config user.name                                  → 获取当前用户标识
3. git ls-remote --heads origin beta/main/master         → 检测存在的目标分支
4. git log <target>..HEAD --no-merges                    → 读取当前用户提交（含完整正文）
   --author="<user.name>" --format="%H %s%n%b"
5. git log <target>..HEAD --no-merges                    → 读取各提交变更文件列表
   --author="<user.name>" --stat
6. git diff <target>..HEAD                               → 读取完整代码变更
7. 按优先级分组（feat > perf > refactor），结合 diff 提取核心变更
8. 按模板字段逐项填充，生成 MR 描述
9. 输出描述内容，供用户确认后自行粘贴
```

`Closes` 字段从分支名中提取 issue 号：`lfz/feat/549_dance_base` → `Closes #549`；也接受完整 URL。如果分支名不含数字，向用户询问。

## 6. 合并请求描述（重构类）

当 MR 标题包含 `refactor:` 时，描述**必须**包含以下结构化字段：

```
类型：代码重构
重构目标：[说明重构的范围和预期效果]
重构原因：[说明为什么需要重构，解决什么技术债务或维护痛点]
重构方案：[说明重构的具体思路和步骤，而非仅罗列文件变更]
影响范围：[列出受影响的模块、接口或功能，确保 reviewer 知晓 review 范围]
```

## 7. 合并请求描述（性能优化类）

当 MR 标题包含 `perf:` 时，描述**必须**包含以下结构化字段：

```
类型：性能优化
优化目标：[说明优化的指标和预期提升幅度]
优化原因：[说明当前性能瓶颈及其对用户/系统的影响]
优化方案：[说明具体优化手段，如缓存策略、算法替换、懒加载等]
验证结果：[性能对比数据，如渲染耗时、包体积、帧率的前后对比]
```

## 8. 合并请求描述（工程维护类）

当 MR 标题包含 `chore:`、`ci:`、`build:`、`test:` 或 `deploy:` 时，描述**必须**包含以下结构化字段：

```
类型：工程维护
变更内容：[说明具体变更]
变更原因：[说明为什么需要这个变更]
影响范围：[说明影响了哪些流程、配置或开发者工具链]
```

## 9. 分支管理策略

### Merge 策略

- **禁止 `git merge` 合并 feature 分支。** 合入目标分支前必须先 rebase，保持提交历史线性。
- 合入 beta/master 时使用 `git merge --no-ff`（或平台 MR 的 "Merge commit" 选项），保留 feature 分支的可追溯性。

### Rebase 流程

合入前将 feature 分支 rebase 到目标分支最新 commit：

```bash
git fetch origin
git rebase origin/<target>
# 如有冲突，解决后 git rebase --continue
```

Rebase 后必须 force-push 更新远端 feature 分支（见下方 Force-Push 策略）。



## 速查表

| 操作 | 核心规则 |
|------|----------|
| 分支名 | `userSlug/type/snake_keywords` — 仅用下划线，禁用短横线 |
| 分支类型 | 选择最高优先级：bug > fix > perf > ui > style > util > deploy > release > docs > feat > refactor > test > ci > chore > build |
| 提交主题 | `<type>: <subject>` — ≤ 72 字符 |
| 提交正文 | 3-6 条动词开头的要点，说明原因 |
| 文件暂存 | 禁止 `git add .` — 过滤后逐个暂存 |
| 修复类 MR | 必须包含：问题现象、问题原因、修复方案、引入来源、责任人 |
| 功能类 MR | 必须包含：类型、需求目标、需求原因、实现方案 |
| 重构类 MR | 必须包含：重构目标、重构原因、重构方案、影响范围 |
| 性能优化 MR | 必须包含：优化目标、优化原因、优化方案、验证结果 |
| 工程维护 MR | 必须包含：变更内容、变更原因、影响范围（chore/ci/build/test/deploy） |
| 来源提交 | 使用 `git log -S` / `git blame` — 必须在 beta/master 上 |
| 责任人 | 来源提交的作者，通过 `git log -1 --format='%an <%ae>'` 获取 |
| Rebase | 合入前必须 rebase 到目标分支，保持线性历史 |
| Force-Push | 仅允许 `--force-with-lease` 到自己 userSlug 的分支 |
