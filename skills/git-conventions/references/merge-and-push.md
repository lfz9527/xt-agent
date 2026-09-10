# Rebase、Merge 与 Push

## 目标分支

优先使用仓库明确配置的目标分支；否则读取远端分支并按 `beta`、`main`、`master` 顺序选择实际存在者。远端不可访问时，可以使用已有的本地 tracking ref，但必须说明数据可能过期。

## Rebase 与 Merge 的边界

- “先 rebase”表示把 feature 分支更新到目标分支最新提交；它不等于把 feature 分支合并进目标分支。
- 默认不要在本地把 feature 分支 merge 到目标分支。是否使用 `git merge --no-ff` 应由仓库策略、平台 MR 设置或用户明确要求决定。
- 执行 rebase 前检查工作区是否干净、当前分支是否为预期分支、目标 ref 是否存在。不要自动 stash、reset 或删除用户变更。

常见流程：

```text
git status --short
git fetch --prune <remote>
git rebase <remote>/<target>
```

发生冲突时停止并报告冲突文件和当前 rebase 状态；不要自动选择冲突内容，也不要未经请求执行 `git rebase --abort`。

## Force-push

- 普通 push 不能快进时，优先使用 `--force-with-lease`，绝不默认使用 `--force`。
- 只允许更新已核验的用户 feature 分支，不更新受保护分支或不属于用户标识的分支。
- rebase 前记录远端旧 commit，尽量使用带明确期望值的 lease 和明确 ref，例如：

```text
git push --force-with-lease=refs/heads/<branch>:<expected-old-oid> <remote> HEAD:refs/heads/<branch>
```

- force-push 是远端变更，只有用户明确授权时执行。执行后用 `git ls-remote` 核对远端 ref；lease 失败时停止，不改用 `--force` 重试。
