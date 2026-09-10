# 分支工作流

## 标识与命名

- `userSlug` 优先使用用户明确提供的值；否则读取仓库已有配置，最后才参考 `git config --get user.name`。
- 将名称转为小写，空白转为 `_`，只保留 `[a-z0-9_]`。如果中文或符号处理后为空或有歧义，不擅自猜拼音，向用户索取标识。
- 格式固定为 `<userSlug>/<type>/<snake_keywords>`。关键字使用 2-5 个英文单词，仅允许 `[a-z0-9_]`，完整分支名不超过仓库规定的长度；没有仓库规定时建议不超过 50 个字符。
- 类型应表达变更的主要意图。只有多个意图竞争时才使用仓库配置的优先级作为决胜规则，不要仅凭文件目录机械分类。

常见类型：`bug`（线上故障或数据错误）、`fix`（普通缺陷修复）、`perf`（性能）、`ui`/`style`（界面样式）、`util`（公共工具）、`deploy`/`release`（发布）、`docs`（文档）、`feat`（功能）、`refactor`（重构）、`test`（测试）、`ci`（持续集成）、`chore`（维护）、`build`（构建）。以仓库实际约定为准。

## 创建前检查

使用精确 ref 检查格式及本地、远端重复：

```text
git check-ref-format --branch <branch>
git rev-parse --verify --quiet refs/heads/<branch>
git ls-remote --exit-code --heads <remote> refs/heads/<branch>
```

命令中的占位符应在执行前替换并正确引用。若本地或远端已存在同名分支，先报告现状；不要自动改名、覆盖或切换到该分支，除非用户选择了具体方案。

## 创建后的验证

创建并切换分支后，检查 `git branch --show-current` 和 `git status --short`。如果当前工作区有未提交变更，不要隐式携带、暂存或丢弃这些变更；先说明其状态。
