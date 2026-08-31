# Electron Review Rules

Electron 项目需要同时审查主进程、Preload 和 Renderer，并重点关注进程边界与 IPC 安全。

## Review 重点

- Main / Preload / Renderer 职责和边界
- IPC channel 的设计、输入校验和权限控制
- `contextIsolation`、`sandbox`、`nodeIntegration` 等安全配置
- Preload 暴露 API 的最小权限原则
- Renderer 对 Node / Electron 能力的间接访问
- IPC 数据来源、信任边界和序列化
- 外部 URL、导航、窗口创建和 `webContents` 安全
- 主进程资源生命周期、窗口销毁和事件监听清理
- Electron API 与版本兼容性
- 原生模块、打包配置和构建产物
- 重复的 IPC、Preload API、窗口管理和 Electron 工具函数

详细结构化规则见同目录 `rules.yaml`。