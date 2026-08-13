---
name: use-browser-cdp
description: 在 Windows / Git Bash 下为浏览器自动化启动「带登录态」的 Edge CDP 调试浏览器并验证连接。当用户说"启动浏览器CDP"、"开启CDP浏览器"、"启动浏览器自动化环境"、"Edge CDP 起不来"、"连不上9222"、或需要为浏览器自动化准备环境时使用。只负责启动和验证，不驱动页面操作（页面操作交给 browser-use 技能）。
---

# Browser CDP（Edge 调试浏览器启动与连接验证）

在 Windows / Git Bash 下，为浏览器自动化准备「带登录态」的 Edge CDP 调试实例，并验证 CDP 端口就绪。

## 职责边界

本技能**只负责**：

- 初始化独立的 CDP 登录态环境（仅首次，自动跳过）
- 启动 Edge CDP（默认端口 9222）
- 验证 CDP 连接可用

**不负责**驱动页面（打开网页、点击、填表、截图等）——这些操作使用 `browser-use` 技能，它连接的正是本技能启动的 9222 端口。

## 使用流程

1. **先探测是否已在运行**

   ```bash
   curl -s http://127.0.0.1:9222/json/version
   ```

   返回包含 `Browser` 字段的 JSON → 已就绪，直接跳到第 4 步报告。若已在运行，**不要再启动第二个实例**（同一用户目录会被锁定）。

2. **启动 CDP Edge**

   运行捆绑脚本（固定路径）：

   ```bash
   bash "/e/lifangzheng-t/xt-agent/skills/use-browser-cdp/scripts/launch-cdp-edge.sh"
   ```

   Windows 路径：`E:\lifangzheng-t\xt-agent\skills\use-browser-cdp\scripts\launch-cdp-edge.sh`

   脚本逻辑：

   - 若登录态未初始化（`scripts\.initialized` 标记文件不存在）→ 脚本**自动结束所有 Edge 进程**（会关闭正在使用的浏览器，未保存内容丢失）后从日常 Edge 复制登录态
   - 启动 Edge CDP（独立用户目录 `Edge-OpenClaw`，与日常 Edge 互不影响）

3. **验证就绪**

   轮询 `curl -s http://127.0.0.1:9222/json/version`（间隔 1 秒，最多 10 次），直到返回 JSON。

4. **报告结果**

   告知 CDP 地址 `http://127.0.0.1:9222` 已就绪，可交给 `browser-use` 使用。

## 失败排查清单

- **端口被占用**：`netstat -ano | grep 9222`，确认占用者是否是 CDP Edge
- **启动后立刻退出**：`Edge-OpenClaw` 目录可能损坏 → 删除该目录后重跑，会重新初始化
- **复制失败（robocopy 退出码 ≥ 8）**：标记文件已删除但 Edge 进程杀不掉（残留进程占锁），检查任务管理器强制结束所有 Edge 后重试

## 关键路径

| 项 | 路径 |
|---|---|
| 日常 Edge 配置 | `%LOCALAPPDATA%\Microsoft\Edge\User Data` |
| CDP 专用环境 | `%LOCALAPPDATA%\Microsoft\Edge\Edge-OpenClaw` |
| 登录态判定文件 | `scripts\.initialized`（与 skill 绑定，复制成功后由脚本创建，存在即已初始化） |
| Edge 可执行文件 | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |

## 注意事项

- 登录态**只在首次初始化时复制**；日常 Edge 的登录变化不会同步到 CDP 环境，Cookie 过期后需**删除 `Edge-OpenClaw` 目录和 `scripts\.initialized` 标记文件**再重建
- 脚本使用 `--remote-allow-origins="*"`，任意网页可访问 CDP 端口，仅限本机自用环境
- 日常 Edge 与 CDP Edge 可同时运行（不同用户目录），互不影响
- Windows 平台特性：robocopy 参数需经 `MSYS2_ARG_CONV_EXCL` 禁用 Git Bash 路径转换，否则 `/E` 会被误转成 `E:/`
