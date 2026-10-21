---
name: sync-xt-harness-skills
description: 将同级 `xt-harness-agent/skills` 中的有效技能增量链接到当前项目的 `skills/`；用户要求同步、补齐或链接这些技能时使用。
---

# 同步 xt-harness-agent 技能

将来源技能目录直接链接到当前项目，保持来源内容单一。不要复制或修改来源技能文件。

## 路径

- 用 `git rev-parse --show-toplevel` 确认当前项目根目录。
- 默认来源为项目根目录同级的 `xt-harness-agent/skills`，目标为当前项目的 `skills/`。
- 用户明确指定其他路径时遵循指定路径。若默认来源不存在，不要猜测其他来源，向用户说明缺失路径并询问。

## 增量规则

1. 只把来源目录的直接子目录中含有 `SKILL.md` 的目录视为技能。不要链接安装包、README 集合或其他缺少 `SKILL.md` 的目录。
2. 检查目标目录的直接子项，包括链接和断链项。不能只用 `Test-Path` 判断名称是否空闲，因为断链仍占用该名称。
3. 目标名称不存在时，创建指向来源目录的目录链接。目标已是指向同一来源的链接时保持不变；若同名项是普通目录、文件、断链或指向其他位置的链接，保留原项并报告冲突，不覆盖、不删除。
4. Windows 优先创建 `SymbolicLink`。若系统仅因缺少创建符号链接的权限而拒绝，可为目录创建 `Junction`；报告实际链接类型。若用户明确要求 Git 可识别的符号链接，则不要用 Junction 替代，应说明权限限制。
5. 完成后核对新增和已有链接的目标路径，并确认经链接可读取 `SKILL.md`。汇报新增、已存在、冲突和跳过的目录。

PowerShell 创建命令：

```powershell
New-Item -ItemType SymbolicLink -Path $destinationPath -Target $sourcePath
```

仅在上述权限限制下改用：

```powershell
New-Item -ItemType Junction -Path $destinationPath -Target $sourcePath
```
