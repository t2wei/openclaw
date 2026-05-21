#!/bin/bash
#
# OpenClaw Custom Fork Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [--restart] [--skip-tests] [--skip-pull]
#
# Options:
#   --restart      Kill current gateway and start new one after build
#   --skip-tests   Skip unit tests (faster, use when only config changes)
#   --skip-pull    Skip git pull (use when building from current working tree)
#
# After --restart, the gateway will probe itself via WebSocket and roll back
# to dist.bak automatically if the health check fails within 45 seconds.
# Monitor restart progress with: tail -f /tmp/openclaw-restart.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure node/pnpm are on PATH (nvm installs them here on this server)
NVM_NODE_BIN="/opt/app_data/nodejs/.nvm/versions/node/v22.19.0/bin"
if [[ ":$PATH:" != *":$NVM_NODE_BIN:"* ]]; then
  export PATH="$NVM_NODE_BIN:$PATH"
fi

NODE="${NODE:-$(command -v node 2>/dev/null || echo "$NVM_NODE_BIN/node")}"
PNPM="${PNPM:-$(command -v pnpm 2>/dev/null || echo "$NVM_NODE_BIN/pnpm")}"
RESTART=false
SKIP_TESTS=false
SKIP_PULL=false

# ── Parse arguments ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --restart)     RESTART=true;     shift ;;
    --skip-tests)  SKIP_TESTS=true;  shift ;;
    --skip-pull)   SKIP_PULL=true;   shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "=== OpenClaw Custom Fork Deployment ==="
echo "Project : $PROJECT_DIR"
echo "Node    : $NODE"
echo "Restart : $RESTART | Skip tests: $SKIP_TESTS | Skip pull: $SKIP_PULL"
echo ""

cd "$PROJECT_DIR"

# ── 1. Pull ─────────────────────────────────────────────────────────────────

if [ "$SKIP_PULL" = false ]; then
  echo "📥 Pulling latest changes..."
  git pull origin "$(git rev-parse --abbrev-ref HEAD)"
  echo ""
fi

# ── 2. Install dependencies ──────────────────────────────────────────────────

echo "📦 Installing dependencies..."
"$PNPM" install
echo ""

# ── 3. Unit tests (fast, no gateway required) ────────────────────────────────

if [ "$SKIP_TESTS" = false ]; then
  echo "🧪 Running unit tests..."
  "$PNPM" test:fast
  echo ""
fi

# ── 4. Build + backup ────────────────────────────────────────────────────────

echo "🔨 Building..."

# Keep previous dist as fallback for auto-rollback
if [ -d "$PROJECT_DIR/dist" ]; then
  echo "  Backing up dist/ → dist.bak/"
  rm -rf "$PROJECT_DIR/dist.bak"
  cp -r "$PROJECT_DIR/dist" "$PROJECT_DIR/dist.bak"
fi

# Cap Node heap to 1.5 GB to prevent OOM on low-RAM servers (server has 3.7 GB total)
# Memory limit: ~4GB for build (safe with 7.6GB total RAM, leaves room for gateway)
NODE_OPTIONS="--max-old-space-size=4096" "$PNPM" build
echo ""

# ── 5. Restart (if requested) ────────────────────────────────────────────────

if [ "$RESTART" = false ]; then
  echo "=== Build complete (not restarting) ==="
  echo "Version : $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
  echo "Branch  : $(git rev-parse --abbrev-ref HEAD)"
  exit 0
fi

echo "🔄 Restarting gateway..."

# Stop the systemd-managed prod gateway if it's running so we can take the port.
# (The dev fork runs as a manual process, not via systemd.)
if systemctl --user is-active --quiet openclaw-gateway 2>/dev/null; then
  echo "  Stopping systemd openclaw-gateway service..."
  systemctl --user stop openclaw-gateway
fi

# Manual path: use setsid so the restart survives the old gateway's SIGTERM
OLD_PID=$(pgrep -f "openclaw-gateway" | head -1 || true)
RESTART_LOG="/tmp/openclaw-restart.log"

echo "  Old gateway PID : ${OLD_PID:-none}"
echo "  Restart log     : $RESTART_LOG"
echo ""

# Launch the detached restart helper; it will kill $OLD_PID after a brief
# delay so this script (and the agent exec tool) has time to print output.
setsid "$SCRIPT_DIR/do-restart.sh" \
  "$PROJECT_DIR" "$NODE" "${OLD_PID:-}" "$RESTART_LOG" &

echo "⏳ Gateway is restarting in background."
echo "   The current session will be interrupted momentarily."
echo "   After ~15s: tail -f $RESTART_LOG"
echo ""
echo "=== Deployment initiated ==="
echo "Version : $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
echo "Branch  : $(git rev-parse --abbrev-ref HEAD)"
