---
name: leju_kpi_report
description: 根据 GitLab 用户活动记录生成周报/月报总结。当用户提到"生成周报"、"生成月报"、"周报总结"、"月报总结"、"KPI 总结"、"工作周报"时使用。也适用于用户说"总结本周工作"、"写周报"、"这周干了什么"等表述。
---

## 概述

从 GitLab 读取用户活动记录（Events API），生成 50 字以内的简短周报/月报总结。

## 工作流程

### 1. 确定参数

人名固定为 **lifangzheng**，无需询问用户。

根据用户意图确定时间范围：
- **周报**：当前周的周一至周日
- **月报**：当前月份（YYYY-MM）

### 2. 读取配置

按 `leju_opts` 技能读取 `GITLAB_API_TOKEN`（Windows 用户环境变量，User 作用域）、`GITLAB_API_URL` 与用户 ID，本技能不重复声明。

用户 ID（lifangzheng）为固定常量 `1983`，无需查询。

### 3. 获取活动记录

```bash
curl -s -H "PRIVATE-TOKEN: {TOKEN}" "{API_URL}/api/v4/users/1983/events?after={start_date}&before={end_date}&per_page=100"
```

- `{start_date}` / `{end_date}` 格式为 `YYYY-MM-DD`
- 周报：`after` 为本周一，`before` 为本周日+1天
- 月报：`after` 为当月 1 日，`before` 为次月 1 日

**如果 API 返回 401**，提醒用户检查 Token 是否过期。

### 4. 提炼活动

使用全部事件，按来源提取工作描述：

| 事件 | 提取字段 |
|---|---|
| `opened` / `MergeRequest` | `target_title` |
| `opened` / `Issue` | `target_title` |
| `closed` / `MergeRequest` | `target_title` |
| `pushed new` / `null` | `push_data.commit_title` + `push_data.ref`（分支名） |
| `pushed to` / `null` | `push_data.commit_title` + `push_data.ref`（分支名） |
| `commented on` / `*` | `note.body`（取前 60 字摘要） |
| `joined` / `null` | 忽略 |

**同分支去重：** 同一 `ref` 下的多次 push 只保留 `pushed new` 的 `commit_title`，忽略后续 `pushed to`。

**同标题去重：** 同名 MR 的 `opened` + `closed` 合并为一条。若同时存在 MR 和同名 Issue，只保留 MR。

### 5. 输出总结

- **周报**：尽量 50 字以内
- **月报**：尽量 300 字以内

**写作原则：**
- 综合所有事件描述，提炼核心工作方向和主要产出
- 忽略具体条目细节，只概括趋势
- 使用简洁中文
- 月报可按模块/方向分组概括

**标签说明（可作为总结中定性描述的参考）：**

| 标签 | 含义 |
|---|---|
| `#thumbs_up` | 高度认可：提前完成、优秀代码等 |
| `#good` | 一般认可 |
| `#thumbs_down` | 批评：违规、延期、错误代码等 |
| `#thumbs_warn` / `#warn` | 警告 |
| `#work` | 工作量证明 |
| `#help` | 帮助他人 |
| `#emptywork` | 当天无工作进展 |
| `#delay` | 工单超期 |
| `#qa` | QA 工作 |
| `#techsupport` | 技术支持 |
| `#plan` | 编写开发计划 |
| `#push_1` | 简单推进（提醒他人） |
| `#push_2` | 沟通推进（解释概念） |
| `#push_3` | 提供建议推进 |
| `#push_work` | 推动完成项目环节 |
