# 每日18:00自动同步代码到GitHub 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ZCode 工作区创建持久定时自动化，每日 18:00 自动将 `E:\lifangzheng-t\xt-agent` 的改动 commit + push 到 GitHub origin/main

**Architecture:** 使用 CronCreate 创建长期重复的定时任务（cron `0 18 * * *`），触发时由 agent 按设计文档逻辑执行同步。零脚本文件，产物仅为定时自动化配置。

**Tech Stack:** ZCode CronCreate（宿主调度）、git（本地仓库操作）

## Global Constraints

- 调度固定为每日 18:00，cron 表达式 `0 18 * * *`，recurring=true（长期重复，不设 maxRuns）
- 标题保留用户原话："每日下午18:00自动同步代码到GitHub"
- prompt 必须自包含、直接描述最终同步工作，不得要求创建/配置其他自动化
- 无改动时跳过，不产生空提交
- push 失败时如实报告，不静默吞错

---

### Task 1: 创建定时自动化

**Files:**
- 无文件创建（产物为 ZCode 持久定时自动化）

**Interfaces:**
- Produces: 定时自动化 id（Task 2 验证用）

- [ ] **Step 1: 调用 CronCreate 创建定时任务**

调用 CronCreate，参数如下：
- `cron`: `0 18 * * *`
- `title`: `每日下午18:00自动同步代码到GitHub`
- `recurring`: `true`（不传 maxRuns）
- `prompt`:
  ```
  对 E:\lifangzheng-t\xt-agent 项目执行每日自动同步到 GitHub：
  1. 进入项目目录 E:\lifangzheng-t\xt-agent
  2. 执行 git status 检查工作区是否有改动
  3. 无改动：跳过，简短汇报"无改动，已跳过"
  4. 有改动：依次执行 git add -A、git commit -m "chore: 每日自动同步 YYYY-MM-DD"（YYYY-MM-DD 为当天日期）、git push origin main
  5. push 失败（网络/凭据/远端冲突）时如实报告错误信息，不静默吞错
  6. 用中文简短汇报同步结果（提交哈希或跳过说明）
  ```

- [ ] **Step 2: 验证创建成功**

调用 CronList，核对：
- 存在标题为"每日下午18:00自动同步代码到GitHub"的自动化
- cron 为 `0 18 * * *`，recurring=true，处于启用状态

Expected: 列表中出现该自动化，调度与设计一致

- [ ] **Step 3: 提交计划与设计文档（已在 Task 1 前完成的文档提交归入本步核验）**

设计文档已于设计阶段提交（commit `84b553a`），本步仅核验工作区无未提交的相关文件：

```bash
git status --short
```

Expected: 无相关未提交文件（CronCreate 配置本身不进 git 仓库）

### Task 2: 端到端验证同步流程

**Files:**
- 无

**Interfaces:**
- Consumes: Task 1 创建的定时自动化

- [ ] **Step 1: 验证"有改动"路径**

在项目目录创建临时改动文件并执行设计中的同步逻辑：

```bash
echo "sync test $(date)" > sync-test.txt
git add -A
git commit -m "chore: 每日自动同步 $(date +%F)"
git push origin main
```

Expected: push 成功，GitHub 远端可见新提交

- [ ] **Step 2: 验证"无改动"路径**

```bash
git status --short
```

Expected: 空输出（工作区干净），确认无改动时同步逻辑会跳过

- [ ] **Step 3: 清理临时文件并提交**

```bash
rm sync-test.txt
git add -A
git commit -m "chore: 清理同步验证临时文件"
git push origin main
```

Expected: push 成功，远端同步

- [ ] **Step 4: 验证远端与本地一致**

```bash
git fetch origin && git status --short --branch
```

Expected: `## main...origin/main`（无 ahead/behind，本地与远端一致）
