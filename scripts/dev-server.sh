#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${COMPOSER_PORT:-9470}"
cd "$ROOT"
echo "composerIBM → http://127.0.0.1:${PORT}/"
echo "μgrad (optional): file://${MUEEE_ROOT:-/Users/qbit/dev/mueee}/ugrad-r0.html?noauto"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
