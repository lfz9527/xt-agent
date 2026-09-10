---
name: use-browser-cdp
description: 在 Windows / Git Bash 下为浏览器自动化启动「带登录态」的 Edge CDP 调试浏览器并验证连接。当用户说"启动浏览器CDP"、"开启CDP浏览器"、"启动浏览器自动化环境"、"Edge CDP 起不来"、"连不上9222"、或需要为浏览器自动化准备环境时使用。只负责启动和验证，不驱动页面操作（页面操作交给 browser-use 技能）。
---

# Browser CDP（Edge 调试浏览器启动与连接验证）

在 Windows / Git Bash 下，为浏览器自动化准备带登录态的 Edge CDP 调试实例，并验证 CDP 端口就绪。

## 职责边界

本技能只负责：

- 初始化独立的 CDP 登录态环境（仅首次，自动跳过）
- 启动和停止本技能创建的 Edge CDP 实例
- 验证 CDP 连接可用

不负责驱动页面（打开网页、点击、填表、截图等）。页面操作应交给能连接 CDP 地址的 browser-use 技能。

## 快速使用

从 Git Bash 执行当前 skill 目录下的脚本：

~~~bash
bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh"
~~~

脚本会：

1. 先检查 http://127.0.0.1:9222/json/version，已就绪时不启动第二个实例。
2. 首次初始化时只复制登录态所需文件，不复制整个 Edge Profile。
3. 默认不会关闭正在运行的 Edge；检测到 Edge 运行时会安全退出并提示用户。
4. 启动后默认最多等待 10 秒（可通过 CDP_STARTUP_TIMEOUT 调整），并验证 Browser 与 webSocketDebuggerUrl 字段。

初始化确实需要关闭所有 Edge 时，必须显式确认：

~~~bash
bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh" --force-close
~~~

## 管理命令

~~~bash
# 只检查状态，不初始化、不启动
bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh" --status

# 停止本脚本记录且经过参数校验的 CDP 实例
bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh" --stop

# 重新复制登录态；不删除已有 CDP 数据
bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh" --reinit
~~~

## 可选配置

命令行参数和环境变量均可配置：

| 参数 | 环境变量 | 默认值 |
|---|---|---|
| --port | CDP_PORT | 9222 |
| --profile | EDGE_PROFILE | 自动选择含 Cookies 的 Profile |
| --edge | EDGE_PATH | 常见 Edge 安装路径 |
| --user-data | CDP_USER_DATA_DIR | %LOCALAPPDATA%\\Microsoft\\Edge\\Edge-OpenClaw |
| 无命令行参数 | CDP_ALLOWED_ORIGINS | http://127.0.0.1,http://localhost |
| 无命令行参数 | CDP_STARTUP_TIMEOUT | 10 秒 |

例如：

~~~bash
EDGE_PROFILE="Profile 1" CDP_PORT=9333 \
  bash "/e/lifangzheng-t/xt-harness-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh"
~~~

## 关键路径

| 项 | 路径 |
|---|---|
| 日常 Edge 配置 | %LOCALAPPDATA%\\Microsoft\\Edge\\User Data |
| CDP 专用环境 | %LOCALAPPDATA%\\Microsoft\\Edge\\Edge-OpenClaw |
| 初始化标记 | CDP 专用环境下的 .initialized，不写入仓库 |
| PID 文件 | CDP 专用环境下的 .cdp.pid |
| 启动日志 | CDP 专用环境下的 logs/cdp-edge.log |

登录态初始化会复制 Local State、Preferences、Cookies，以及可选的 Local Storage、Session Storage、IndexedDB 和 Storage。源 Profile 默认从 Default 开始自动探测，也可使用 --profile 指定。

## 失败排查

- 端口被占用：执行 netstat -ano | grep 9222，确认占用者是否为目标 CDP Edge。
- 启动超时：查看 %LOCALAPPDATA%\\Microsoft\\Edge\\Edge-OpenClaw\\logs\\cdp-edge.log。
- 初始化被阻止或 Cookies 被锁定：关闭日常 Edge 后重试；只有确认可接受数据丢失时才使用 --force-close。
- 登录态过期：关闭 CDP Edge 后运行 --reinit；日常 Edge 也必须已关闭。
- Profile 未找到：使用 --profile "Default" 或 --profile "Profile 1" 明确指定。
- 复制失败：确认源 Profile 中存在 Network\\Cookies，并检查日志与文件权限。

## 安全说明

- CDP 只绑定到 127.0.0.1，不应暴露到局域网或公网。
- 默认只允许本机常见来源；如修改 CDP_ALLOWED_ORIGINS，应只填写明确可信的本机来源。
- CDP 用户数据目录包含 Cookies 等敏感登录态，应限制为当前用户访问，不要提交到 Git 或同步到公共位置。
