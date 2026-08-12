---
name: leju_opts
description: 声明乐聚（leju）相关配置的读取位置与不同环境下的读取方式，包括 GITLAB_API_TOKEN、GITLAB_API_URL、用户 ID 等。当用户询问"配置在哪"、"环境变量怎么配"、"token 怎么读"、"lejuhub 的 token"、"API 地址是什么"、或使用 leju 系 skill（leju_gitlab_ops、leju_kpi_report）需要确认配置读取位置时使用。也适用于配置缺失、token 失效报 401、环境变量取不到值时排查配置读取。
---

# 配置读取

乐聚相关配置分散在环境变量与常量中，本技能是唯一权威声明，其他 leju 系技能（如 `leju_gitlab_ops`、`leju_kpi_report`）应通过本技能确认读取方式，避免各自内嵌重复命令。

## 配置总览

| 配置项 | 存放位置 | 类型 | 用途 |
|--------|---------|------|------|
| `GITLAB_API_TOKEN` | Windows 用户环境变量（User 作用域） | 可变 | GitLab API 访问令牌 |
| `GITLAB_API_URL` | 代码内常量 | 固定 | GitLab 实例地址 |
| 用户 ID（lifangzheng） | 代码内常量 | 固定 | Events API 查询用（leju_kpi_report 使用） |

## 环境变量

配置存放于 Windows 系统用户环境变量（User 作用域）。

### GITLAB_API_TOKEN — GitLab 访问令牌

**Windows (PowerShell)：**

```powershell
[System.Environment]::GetEnvironmentVariable("GITLAB_API_TOKEN", "User")
```

**Linux/macOS (bash)：**

```bash
echo "${GITLAB_API_TOKEN:-(未设置)}"
```

> **注意**：该变量存储在 Windows 用户环境变量（User 作用域），普通 bash/shell 的 `$GITLAB_API_TOKEN` 通常取不到。若需在 shell 中使用，先通过 PowerShell 读取后传入，或确认已在当前 shell 导出。

### 配置缺失时

若读取返回空（未设置），提示用户：
1. 前往 `https://www.lejuhub.com/-/profile/personal_access_tokens` 创建 Token（需勾选 `api` 权限）
2. 设置为用户环境变量 `GITLAB_API_TOKEN`

## 常量

代码写死，无需读取，也不存在于环境变量中。

`GITLAB_API_URL` = `https://www.lejuhub.com/api/v4`

用户 ID（lifangzheng）= `1983`
