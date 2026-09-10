#!/usr/bin/env bash
# Edge CDP launcher for the use-browser-cdp skill.
# This script only prepares and verifies a local Edge CDP instance.
# Run it from Git Bash on Windows.

set -o nounset
set -o pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_ALLOWED_ORIGINS="${CDP_ALLOWED_ORIGINS:-http://127.0.0.1,http://localhost}"
CDP_STARTUP_TIMEOUT="${CDP_STARTUP_TIMEOUT:-10}"
COMMAND="start"
FORCE_CLOSE=0
FORCE_REINIT=0
EDGE_PROFILE="${EDGE_PROFILE:-}"
EDGE_PATH="${EDGE_PATH:-}"
CDP_USER_DATA_DIR="${CDP_USER_DATA_DIR:-}"

usage() {
    cat <<'EOF'
用法:
  launch-cdp-edge.sh [选项]

选项:
  --status          只检查 CDP 是否已就绪，不启动浏览器
  --start           启动 CDP（默认）
  --stop            停止本脚本启动的 CDP 实例
  --reinit          重新从日常 Edge 复制登录态（不删除已有数据）
  --force-close     初始化时显式允许关闭所有 Edge 进程
  --port PORT       CDP 端口，默认 9222
  --profile NAME    源 Edge Profile，例如 Default 或 Profile 1
  --edge PATH       Edge 可执行文件路径
  --user-data PATH  CDP 专用用户数据目录
  --help            显示帮助

也可通过同名环境变量配置：CDP_PORT、EDGE_PROFILE、EDGE_PATH、
CDP_USER_DATA_DIR、CDP_ALLOWED_ORIGINS、CDP_STARTUP_TIMEOUT。
EOF
}

die() {
    printf '%s\n' "$*" >&2
    exit 1
}

while (($# > 0)); do
    case "$1" in
        --status) COMMAND="status"; shift ;;
        --start) COMMAND="start"; shift ;;
        --stop) COMMAND="stop"; shift ;;
        --reinit) FORCE_REINIT=1; shift ;;
        --force-close) FORCE_CLOSE=1; shift ;;
        --port)
            (($# >= 2)) || die "❌ --port 缺少参数"
            CDP_PORT="$2"
            shift 2
            ;;
        --port=*) CDP_PORT="${1#*=}"; shift ;;
        --profile)
            (($# >= 2)) || die "❌ --profile 缺少参数"
            EDGE_PROFILE="$2"
            shift 2
            ;;
        --profile=*) EDGE_PROFILE="${1#*=}"; shift ;;
        --edge)
            (($# >= 2)) || die "❌ --edge 缺少参数"
            EDGE_PATH="$2"
            shift 2
            ;;
        --edge=*) EDGE_PATH="${1#*=}"; shift ;;
        --user-data)
            (($# >= 2)) || die "❌ --user-data 缺少参数"
            CDP_USER_DATA_DIR="$2"
            shift 2
            ;;
        --user-data=*) CDP_USER_DATA_DIR="${1#*=}"; shift ;;
        --help|-h) usage; exit 0 ;;
        *) die "❌ 未知参数: $1（使用 --help 查看帮助）" ;;
    esac
done

if ! [[ "$CDP_PORT" =~ ^[0-9]+$ ]] || ((CDP_PORT < 1 || CDP_PORT > 65535)); then
    die "❌ CDP 端口必须是 1-65535 之间的数字: $CDP_PORT"
fi

if ! [[ "$CDP_STARTUP_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
    die "❌ CDP_STARTUP_TIMEOUT 必须是正整数: $CDP_STARTUP_TIMEOUT"
fi

CDP_URL="http://127.0.0.1:${CDP_PORT}"

get_version() {
    if command -v curl.exe >/dev/null 2>&1; then
        curl.exe -fsS --max-time 2 "$CDP_URL/json/version" 2>/dev/null
        return $?
    fi
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time 2 "$CDP_URL/json/version" 2>/dev/null
        return $?
    fi
    if command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoProfile -NonInteractive -Command \
            '$ProgressPreference="SilentlyContinue"; (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $args[0]).Content' \
            "$CDP_URL/json/version" 2>/dev/null
        return $?
    fi
    return 127
}

cdp_is_ready() {
    local response
    response="$(get_version)" || return 1
    [[ "$response" == *'"Browser"'* ]] || return 1
    [[ "$response" == *'"webSocketDebuggerUrl"'* ]]
}

port_has_listener() {
    command -v netstat.exe >/dev/null 2>&1 || return 1
    netstat.exe -ano -p tcp 2>/dev/null | tr -d '\r' | \
        awk -v port=":${CDP_PORT}" '$1 == "TCP" && $4 == "LISTENING" && $2 ~ (port "$") { found=1 } END { exit !found }'
}

edge_is_running() {
    MSYS2_ARG_CONV_EXCL='*' tasklist.exe /FI "IMAGENAME eq msedge.exe" 2>/dev/null | \
        tr -d '\r' | grep -qi 'msedge.exe'
}

normalize_path() {
    local input="$1"
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -u "$input" 2>/dev/null && return 0
    fi
    printf '%s\n' "$input"
}

require_windows_environment() {
    [[ -n "${LOCALAPPDATA:-}" ]] || die "❌ 未找到 LOCALAPPDATA，请从 Git Bash 运行此脚本"
    LOCAL_APP_DATA="$(normalize_path "$LOCALAPPDATA")"
    [[ -d "$LOCAL_APP_DATA" ]] || die "❌ LOCALAPPDATA 目录不存在: $LOCAL_APP_DATA"

    EDGE_USER_DATA="$LOCAL_APP_DATA/Microsoft/Edge/User Data"
    [[ -d "$EDGE_USER_DATA" ]] || die "❌ 未找到日常 Edge 用户数据目录: $EDGE_USER_DATA"

    if [[ -n "$CDP_USER_DATA_DIR" ]]; then
        USER_DATA_DIR="$(normalize_path "$CDP_USER_DATA_DIR")"
    else
        USER_DATA_DIR="$LOCAL_APP_DATA/Microsoft/Edge/Edge-OpenClaw"
    fi

    [[ "$USER_DATA_DIR" != "$EDGE_USER_DATA" ]] || \
        die "❌ CDP_USER_DATA_DIR 不能指向日常 Edge 用户数据目录"

    LOG_DIR="$USER_DATA_DIR/logs"
    LOG_FILE="$LOG_DIR/cdp-edge.log"
    INIT_MARKER="$USER_DATA_DIR/.initialized"
    INIT_LOCK="$USER_DATA_DIR/.initializing.lock"
    PID_FILE="$USER_DATA_DIR/.cdp.pid"
}

log() {
    local message="$*"
    mkdir -p "${LOG_DIR:-.}" 2>/dev/null || true
    if [[ -n "${LOG_FILE:-}" ]]; then
        printf '%s\n' "$message" | tee -a "$LOG_FILE"
    else
        printf '%s\n' "$message"
    fi
}

find_edge() {
    local candidate discovered
    if [[ -n "$EDGE_PATH" ]]; then
        EDGE="$(normalize_path "$EDGE_PATH")"
        [[ -f "$EDGE" ]] || die "❌ EDGE_PATH 不存在: $EDGE"
        return 0
    fi

    for candidate in \
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' \
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe'; do
        candidate="$(normalize_path "$candidate")"
        if [[ -f "$candidate" ]]; then
            EDGE="$candidate"
            return 0
        fi
    done

    if command -v where.exe >/dev/null 2>&1; then
        discovered="$(where.exe msedge.exe 2>/dev/null | tr -d '\r' | head -n 1)"
        if [[ -n "$discovered" && -f "$discovered" ]]; then
            EDGE="$(normalize_path "$discovered")"
            return 0
        fi
    fi
    die "❌ 未找到 Edge，可通过 --edge 或 EDGE_PATH 指定 msedge.exe"
}

resolve_source_profile() {
    local candidate
    if [[ -n "$EDGE_PROFILE" ]]; then
        SOURCE_PROFILE="$EDGE_USER_DATA/$EDGE_PROFILE"
        [[ -d "$SOURCE_PROFILE" ]] || die "❌ Edge Profile 不存在: $SOURCE_PROFILE"
    else
        for candidate in "$EDGE_USER_DATA/Default" "$EDGE_USER_DATA"/Profile\ *; do
            if [[ -f "$candidate/Network/Cookies" || -f "$candidate/Cookies" ]]; then
                SOURCE_PROFILE="$candidate"
                EDGE_PROFILE="$(basename "$candidate")"
                break
            fi
        done
    fi

    [[ -n "$EDGE_PROFILE" ]] || die "❌ 未找到包含 Cookies 的 Edge Profile，请使用 --profile 指定"
    [[ -f "$SOURCE_PROFILE/Network/Cookies" || -f "$SOURCE_PROFILE/Cookies" ]] || \
        die "❌ Profile 缺少 Cookies 文件: $SOURCE_PROFILE"
    TARGET_PROFILE="$USER_DATA_DIR/$EDGE_PROFILE"
}

marker_is_valid() {
    [[ -f "$INIT_MARKER" ]] || return 1
    grep -Fxq "profile=$EDGE_PROFILE" "$INIT_MARKER" || return 1
    [[ -f "$USER_DATA_DIR/Local State" ]] || return 1
    [[ -f "$TARGET_PROFILE/Network/Cookies" || -f "$TARGET_PROFILE/Cookies" ]]
}

copy_file() {
    local source="$1"
    local target="$2"
    [[ -f "$source" ]] || {
        log "❌ 缺少必要文件: $source"
        return 1
    }
    mkdir -p "$(dirname "$target")" || return 1
    cp -f -- "$source" "$target" || return 1
    [[ -f "$target" ]]
}

copy_optional_tree() {
    local relative="$1"
    local source="$SOURCE_PROFILE/$relative"
    local target="$TARGET_PROFILE/$relative"
    local result

    [[ -d "$source" ]] || {
        log "ℹ️ 跳过不存在的可选目录: $relative"
        return 0
    }
    mkdir -p "$target" || return 1
    MSYS2_ARG_CONV_EXCL='*' robocopy "$(cygpath -w "$source")" "$(cygpath -w "$target")" \
        /E /R:2 /W:1 /NJH /NJS /NFL /NDL /NP >/dev/null
    result=$?
    if ((result >= 8)); then
        log "❌ 目录复制失败: $relative（robocopy=$result）"
        return 1
    fi
    return 0
}

copy_login_state() {
    local source_cookies target_cookies
    local optional

    if [[ -f "$SOURCE_PROFILE/Network/Cookies" ]]; then
        source_cookies="$SOURCE_PROFILE/Network/Cookies"
        target_cookies="$TARGET_PROFILE/Network/Cookies"
    else
        source_cookies="$SOURCE_PROFILE/Cookies"
        target_cookies="$TARGET_PROFILE/Cookies"
    fi

    log "📦 正在复制最小登录态集合（Profile=$EDGE_PROFILE）..."
    copy_file "$EDGE_USER_DATA/Local State" "$USER_DATA_DIR/Local State" || return 1
    copy_file "$SOURCE_PROFILE/Preferences" "$TARGET_PROFILE/Preferences" || return 1
    copy_file "$source_cookies" "$target_cookies" || return 1

    if [[ -f "$SOURCE_PROFILE/Network/Cookies-journal" ]]; then
        copy_file "$SOURCE_PROFILE/Network/Cookies-journal" "$TARGET_PROFILE/Network/Cookies-journal" || return 1
    fi

    for optional in 'Local Storage' 'Session Storage' 'IndexedDB' 'Storage'; do
        copy_optional_tree "$optional" || return 1
    done
}

acquire_init_lock() {
    mkdir -p "$USER_DATA_DIR" || return 1
    if (set -o noclobber; printf '%s\n' "$$" > "$INIT_LOCK") 2>/dev/null; then
        trap 'rm -f -- "$INIT_LOCK"' EXIT
        return 0
    fi
    log "❌ 另一个初始化任务正在运行，或残留锁文件存在: $INIT_LOCK"
    return 1
}

close_all_edge() {
    log "⚠️ 已显式指定 --force-close，将结束所有 Edge 进程"
    MSYS2_ARG_CONV_EXCL='*' taskkill.exe /F /IM msedge.exe >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
        edge_is_running || return 0
        sleep 1
    done
    edge_is_running && return 1
    return 0
}

initialize_profile() {
    if ((FORCE_REINIT == 0)) && marker_is_valid; then
        log "✅ 登录态已初始化（Profile=$EDGE_PROFILE）"
        return 0
    fi

    acquire_init_lock || return 1
    if edge_is_running; then
        if ((FORCE_CLOSE == 0)); then
            log "❌ 检测到 Edge 正在运行。为避免丢失未保存内容，已停止初始化。"
            log "   请关闭 Edge 后重试；如确认允许强制关闭，请增加 --force-close。"
            return 2
        fi
        close_all_edge || {
            log "❌ Edge 进程未能在 20 秒内完全退出"
            return 1
        }
    fi

    mkdir -p "$TARGET_PROFILE" || return 1
    copy_login_state || {
        if edge_is_running; then
            log "❌ 登录态复制失败：Edge 仍在运行并锁定 Cookies。请关闭 Edge 后重试。"
        else
            log "❌ 登录态复制失败，初始化标记不会写入"
        fi
        return 1
    }

    local marker_tmp="$INIT_MARKER.$$"
    {
        printf 'version=1\n'
        printf 'profile=%s\n' "$EDGE_PROFILE"
        printf 'initialized_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } > "$marker_tmp" || {
        rm -f -- "$marker_tmp"
        return 1
    }
    mv -f -- "$marker_tmp" "$INIT_MARKER" || {
        rm -f -- "$marker_tmp"
        return 1
    }

    rm -f -- "$INIT_LOCK"
    trap - EXIT
    log "✅ 登录态初始化完成"
    return 0
}

process_command_line() {
    local pid="$1"
    powershell.exe -NoProfile -NonInteractive -Command \
        "(Get-CimInstance Win32_Process -Filter \\"ProcessId=$pid\\").CommandLine" 2>/dev/null | tr -d '\r'
}

stop_cdp() {
    local pid command_line
    [[ -f "$PID_FILE" ]] || {
        log "ℹ️ 未找到本脚本记录的 CDP PID: $PID_FILE"
        return 0
    }
    pid="$(tr -dc '0-9' < "$PID_FILE")"
    rm -f -- "$PID_FILE"
    [[ -n "$pid" ]] || {
        log "⚠️ PID 文件为空，已清理"
        return 0
    }

    command_line="$(process_command_line "$pid")"
    if [[ "$command_line" != *"--remote-debugging-port=$CDP_PORT"* || "$command_line" != *"--user-data-dir="* ]]; then
        log "⚠️ 未验证 PID $pid 属于本脚本启动的 CDP，未执行结束操作"
        return 1
    fi

    MSYS2_ARG_CONV_EXCL='*' taskkill.exe /F /T /PID "$pid" >/dev/null 2>&1 || {
        log "⚠️ 结束 CDP 进程失败，PID=$pid"
        return 1
    }
    log "✅ 已停止 CDP Edge，PID=$pid"
    return 0
}

report_ready() {
    log "✅ CDP 已就绪: $CDP_URL"
    log "   可将该地址交给 browser-use 使用"
}

if [[ "$COMMAND" == "status" ]]; then
    if cdp_is_ready; then
        report_ready
        exit 0
    fi
    printf 'ℹ️ CDP 未就绪: %s\n' "$CDP_URL"
    exit 1
fi

require_windows_environment

if [[ "$COMMAND" == "stop" ]]; then
    stop_cdp
    exit $?
fi

if cdp_is_ready; then
    report_ready
    exit 0
fi

if port_has_listener; then
    die "❌ 端口 $CDP_PORT 已被其他进程占用，但不是可用的 Edge CDP"
fi

find_edge
resolve_source_profile
mkdir -p "$LOG_DIR" || die "❌ 无法创建日志目录: $LOG_DIR"

initialize_profile
init_result=$?
((init_result == 0)) || exit "$init_result"

log "🚀 正在启动 Edge CDP（端口 $CDP_PORT，Profile=$EDGE_PROFILE）..."
"$EDGE" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$CDP_PORT" \
    --remote-allow-origins="$CDP_ALLOWED_ORIGINS" \
    --user-data-dir="$(cygpath -w "$USER_DATA_DIR")" \
    >>"$LOG_FILE" 2>&1 &
EDGE_PID=$!
printf '%s\n' "$EDGE_PID" > "$PID_FILE"

for _ in $(seq 1 "$CDP_STARTUP_TIMEOUT"); do
    if cdp_is_ready; then
        report_ready
        exit 0
    fi
    sleep 1
done

log "❌ CDP 在 ${CDP_STARTUP_TIMEOUT} 秒内未就绪: $CDP_URL"
log "   Edge 日志: $LOG_FILE"
exit 5
