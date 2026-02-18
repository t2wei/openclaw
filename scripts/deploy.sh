#!/bin/bash
#
# OpenClaw Custom Fork Deployment Script
# Usage: ./scripts/deploy.sh [--restart]
#
# This script:
# 1. Pulls latest changes from git
# 2. Installs dependencies
# 3. Builds the project
# 4. Optionally restarts the gateway
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESTART=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --restart)
      RESTART=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== OpenClaw Custom Fork Deployment ==="
echo "Project: $PROJECT_DIR"
echo "Restart: $RESTART"
echo ""

cd "$PROJECT_DIR"

# 1. Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin "$(git rev-parse --abbrev-ref HEAD)"
echo ""

# 2. Install dependencies
echo "📦 Installing dependencies..."
pnpm install
echo ""

# 3. Build
echo "🔨 Building..."
pnpm build
echo ""

# 4. Restart if requested
if [ "$RESTART" = true ]; then
  echo "🔄 Restarting gateway..."
  
  # Check if running as systemd service
  if systemctl is-active --quiet openclaw-gateway 2>/dev/null; then
    sudo systemctl restart openclaw-gateway
    echo "✅ Gateway restarted via systemd"
  else
    # Try to find and restart the process
    PID=$(pgrep -f "openclaw-gateway" || true)
    if [ -n "$PID" ]; then
      echo "Stopping gateway (PID: $PID)..."
      kill "$PID"
      sleep 2
    fi
    
    echo "Starting gateway..."
    cd "$PROJECT_DIR"
    nohup node ./openclaw.mjs gateway > /tmp/openclaw-gateway.log 2>&1 &
    echo "✅ Gateway started (PID: $!)"
  fi
fi

echo ""
echo "=== Deployment Complete ==="
echo "Current version: $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
