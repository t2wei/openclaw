#!/bin/bash
#
# Detached gateway restart helper.
# Called by deploy.sh via setsid — runs in its own session so it survives
# the SIGTERM that kills the old gateway process group.
#
# Args: <project_dir> <node_bin> <old_pid> <restart_log>

set -euo pipefail

PROJECT_DIR="$1"
NODE="$2"
OLD_PID="$3"
RLOG="$4"
GW_LOG="/tmp/openclaw-gateway.log"

# Ensure node is on PATH
NVM_NODE_BIN="/opt/app_data/nodejs/.nvm/versions/node/v22.19.0/bin"
if [[ ":$PATH:" != *":$NVM_NODE_BIN:"* ]]; then
  export PATH="$NVM_NODE_BIN:$PATH"
fi

PROBE_ATTEMPTS=6
PROBE_INTERVAL=5   # seconds between probe attempts
INIT_WAIT=8        # seconds to wait before first probe

log() { echo "[restart] $(date '+%H:%M:%S') $1" | tee -a "$RLOG"; }

# ── Clean slate for restart log ───────────────────────────────────────────────
echo "" > "$RLOG"
log "Restart initiated (old_pid=${OLD_PID:-none})"

# ── Kill old gateway ──────────────────────────────────────────────────────────
# Brief delay so deploy.sh can finish printing its output first.
sleep 2

if [ -n "$OLD_PID" ]; then
  log "Sending SIGTERM to old gateway (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 2
fi

# ── Start new gateway ─────────────────────────────────────────────────────────
log "Starting new gateway..."
cd "$PROJECT_DIR"
nohup "$NODE" ./openclaw.mjs gateway >> "$GW_LOG" 2>&1 &
NEW_PID=$!
log "New gateway PID: $NEW_PID"

# ── Health probe (via WebSocket gateway call) ─────────────────────────────────
log "Waiting ${INIT_WAIT}s for gateway to initialize..."
sleep "$INIT_WAIT"

probe_ok=false
for i in $(seq 1 $PROBE_ATTEMPTS); do
  log "Health probe attempt $i/$PROBE_ATTEMPTS..."
  if RESULT=$("$NODE" ./openclaw.mjs gateway call health 2>/dev/null) \
     && echo "$RESULT" | grep -q '"ok":true'; then
    log "✅ Gateway healthy! Deployment complete."
    probe_ok=true
    break
  fi
  log "  Probe failed, retrying in ${PROBE_INTERVAL}s..."
  sleep "$PROBE_INTERVAL"
done

if [ "$probe_ok" = true ]; then
  # Clean up backup on success
  rm -rf "$PROJECT_DIR/dist.bak"
  log "Backup dist.bak removed."
  exit 0
fi

# ── Rollback ──────────────────────────────────────────────────────────────────
log "❌ All probes failed. Rolling back to dist.bak..."

kill "$NEW_PID" 2>/dev/null || true
sleep 1

if [ -d "$PROJECT_DIR/dist.bak" ]; then
  log "Restoring dist.bak → dist..."
  rm -rf "$PROJECT_DIR/dist"
  mv "$PROJECT_DIR/dist.bak" "$PROJECT_DIR/dist"
  log "Starting rollback gateway..."
  nohup "$NODE" ./openclaw.mjs gateway >> "$GW_LOG" 2>&1 &
  log "Rollback gateway started (PID: $!). Check $RLOG for full details."
else
  log "⚠️  No dist.bak found — cannot roll back automatically."
fi

exit 1
