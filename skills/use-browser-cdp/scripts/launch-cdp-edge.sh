#!/bin/bash
# Edge CDP Launcher —— use-browser-cdp 技能捆绑版
# 供浏览器自动化使用：初始化登录态（仅首次）+ 启动 Edge CDP（端口 9222）
# 由 SKILL.md 调用，非交互式（不阻塞等待按键）
# 注意: 在 Git Bash 中运行（含 cygpath / MSYS2 路径规则）

CDP_PORT=9222

# 日常 Edge 用户数据目录（登录态等源数据所在）
EDGE_USER_DATA="$(cygpath -u "$LOCALAPPDATA")/Microsoft/Edge/User Data"
SOURCE_PROFILE="$EDGE_USER_DATA/Default"

# 独立自动化环境目录（仅放登录态，不影响日常浏览器）
USER_DATA_DIR="$(cygpath -u "$LOCALAPPDATA")/Microsoft/Edge/Edge-OpenClaw"

# Edge 可执行文件（标准安装位置；若装在其他位置请修改此路径）
EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

# 脚本自身所在目录（无论从哪个 cwd 调用，都解析到 skill 的 scripts 目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 登录态初始化标记文件：与 skill 绑定，放在脚本同目录下。
# 全部复制成功后才创建；文件存在即视为已初始化。
INIT_MARKER="$SCRIPT_DIR/.initialized"

if [ ! -f "$EDGE" ]; then
    echo "❌ 未找到 Edge 可执行文件: $EDGE" >&2
    exit 1
fi

# —— 初始化（仅当标记文件缺失时执行一次）——
if [ ! -f "$INIT_MARKER" ]; then
    echo "🔄 初始化 CDP 登录态..."

    # Edge 运行时会锁定 Cookies 等登录态数据库，无法可靠复制。
    # 按需求自动结束所有 Edge 进程后再复制（会关闭正在使用的浏览器，未保存内容会丢失）
    if tasklist.exe 2>/dev/null | grep -qi "msedge.exe"; then
        echo "⚠️ 检测到 Edge 正在运行，自动结束所有 Edge 进程以便复制登录态..."
        taskkill.exe //F //IM msedge.exe > /dev/null 2>&1
        # 等待所有 msedge 进程完全退出（最多 20 秒）
        for i in $(seq 1 20); do
            if ! tasklist.exe 2>/dev/null | grep -qi "msedge.exe"; then
                break
            fi
            sleep 1
        done
        if tasklist.exe 2>/dev/null | grep -qi "msedge.exe"; then
            echo "❌ Edge 进程未能完全退出，无法复制登录态。" >&2
            exit 1
        fi
        echo "✅ Edge 进程已全部结束"
    fi

    mkdir -p "$USER_DATA_DIR"
    echo "📦 正在复制登录态文件（排除缓存、扩展程序等重数据）..."

    # 使用 robocopy 只复制登录态必要文件，排除所有缓存和重数据
    # 注意: Git Bash 会把 /E、/XD 等开关误当路径转成 E:/、XD: 等，导致 robocopy
    #       报"无效参数"，必须通过 MSYS2_ARG_CONV_EXCL 禁用参数转换
    # robocopy 退出码 0-7 均为成功，>=8 才是失败
    MSYS2_ARG_CONV_EXCL="*" robocopy "$(cygpath -w "$SOURCE_PROFILE")" "$(cygpath -w "$USER_DATA_DIR/Default")" /E \
        /XD "Cache" "GPUCache" "DawnGraphiteCache" "DawnWebGPUCache" \
            "Code Cache" "Service Worker" "Extensions" "Session*" \
            "Crashpad" "Metrics" "Theme Data" "Network Action Predictor" \
            "Reporting and NEL" "AttachedScript" "Shortcuts" "Trust Tokens" \
            "image_cache" \
        /XF "History*" "Top Sites*" "Favicons*" "Preferences" \
        /R:2 /W:1 \
            "Pref Extensions" "TransportSecurity" "optimization_guide*" \
            "*.log" "*.tmp" \
        /NJH /NJS /NFL /NDL /NP
    if [ $? -ge 8 ]; then
        echo "❌ 登录态文件复制失败（robocopy 退出码 >= 8）" >&2
        echo "   多半是 Edge 未完全关闭，请关闭后重试" >&2
        exit 1
    fi

    # 复制必要的偏好设置文件（轻量级）
    if [ -f "$SOURCE_PROFILE/Preferences" ]; then
        cp "$SOURCE_PROFILE/Preferences" "$USER_DATA_DIR/Default/Preferences"
    fi

    # 创建必要的本地状态文件（含 Cookie 加密密钥等）
    if [ -f "$EDGE_USER_DATA/Local State" ]; then
        cp "$EDGE_USER_DATA/Local State" "$USER_DATA_DIR/Local State"
    fi

    # 标记初始化完成：只有全部复制成功后才会创建
    touch "$INIT_MARKER"

    echo "✅ 登录态初始化完成"
fi

# —— 启动 Edge CDP ——
# ⚠️ --remote-allow-origins="*" 允许任意来源访问 CDP 端口，仅限本机自用场景
echo "🚀 正在启动 Edge CDP（端口 $CDP_PORT）..."
"$EDGE" \
    --remote-debugging-port="$CDP_PORT" \
    --remote-allow-origins="*" \
    --user-data-dir="$(cygpath -w "$USER_DATA_DIR")" \
    > /dev/null 2>&1 &

echo "✅ 启动命令已发出（就绪验证由 SKILL.md 第 3 步完成）"
