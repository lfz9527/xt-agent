#!/usr/bin/env bash
# Convenience wrapper for stopping the CDP Edge instance started by the launcher.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/launch-cdp-edge.sh" --stop "$@"
