# 每日 18:00 自动同步代码到 GitHub — 设计文档

- 日期：2026-08-12
- 状态：已批准

## 目标

在 `E:\lifangzheng-t\xt-agent` 项目上创建持久定时自动化：每日 18:00 自动将本地改动同步（commit + push）到 GitHub 远程仓库 `origin/main`。

## 承载形式

ZCode 工作区持久定时自动化（CronCreate），零脚本文件。

## 调度

- cron：`0 18 * * *`（每日 18:00）
- 模式：长期重复（recurring）
- 触发后由 ZCode 宿主执行，prompt 描述完整同步逻辑

## 执行逻辑（每次触发）

1. 进入项目目录 `E:\lifangzheng-t\xt-agent`
2. `git status` 检查工作区是否有改动
3. 有改动：
   - `git add -A`
   - `git commit -m "chore: 每日自动同步 YYYY-MM-DD"`（YYYY-MM-DD 为当天日期）
   - `git push origin main`
4. 无改动：跳过，不产生空提交

## 依赖

- Git Credential Manager 已缓存 HTTPS 凭据（已验证 `git ls-remote` 连通，2026-08-12 验证通过）
- 本地代理 `http://127.0.0.1:7890` 已配置（项目级 `http.proxy`）
- 根 `.gitignore` 忽略 `.claude-plugin/`（ZCode 客户端插件配置目录，2026-08-12 新增，避免被每日 `git add -A` 推送至公开仓库）

## 失败处理

- push 失败（网络/凭据/远端冲突）时如实向用户报告错误信息，不静默吞错
- 无改动时直接跳过，不产生空提交、不打扰

## 验收标准

1. 定时自动化已创建，调度为每日 18:00，长期重复
2. 立即触发一次验证：有改动时完成 add/commit/push，远端可见新提交
3. 无改动时跳过，工作区保持干净
