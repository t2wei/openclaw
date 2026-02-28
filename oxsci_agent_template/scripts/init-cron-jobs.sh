#!/bin/bash
# init-cron-jobs.sh - Initialize cron jobs for oxsciClaw
#
# Run BEFORE gateway starts, or restart gateway after running.
# This script is idempotent — it won't overwrite existing jobs.
#
# Usage: ./init-cron-jobs.sh <env> [state-dir]
#   env:       dev | prod
#   state-dir: optional, defaults to /opt/openclaw

set -euo pipefail

ENV="${1:?Usage: $0 <dev|prod> [state-dir]}"
STATE_DIR="${2:-/opt/openclaw}"
CRON_DIR="$STATE_DIR/cron"
JOBS_FILE="$CRON_DIR/jobs.json"

# Tony's Lark open_id per environment
case "$ENV" in
  dev)  TONY_OPEN_ID="ou_edc6f66e761b5706a3b47b38102f9630" ;;
  prod) TONY_OPEN_ID="ou_63843179615e32306ec9ad752cd8fe34" ;;
  *)    echo "Error: env must be dev or prod"; exit 1 ;;
esac

mkdir -p "$CRON_DIR"

# Idempotent: skip if job already exists
if [ -f "$JOBS_FILE" ]; then
  if grep -q '"daily-memory-maintain"' "$JOBS_FILE"; then
    echo "Job 'daily-memory-maintain' already exists in $JOBS_FILE, skipping."
    exit 0
  fi
fi

NOW_MS=$(date +%s)000

cat > "$JOBS_FILE" << ENDJSON
{
  "jobs": [
    {
      "id": "daily-memory-maintain",
      "name": "Daily Memory Maintenance",
      "description": "Daily consolidation: daily log → detail extraction, SELF.md overflow, KB promotion, docs cleanup",
      "enabled": true,
      "createdAtMs": ${NOW_MS},
      "updatedAtMs": ${NOW_MS},
      "schedule": {
        "kind": "cron",
        "expr": "0 21 * * *",
        "tz": "UTC"
      },
      "sessionTarget": "isolated",
      "wakeMode": "now",
      "payload": {
        "kind": "agentTurn",
        "message": "Read the file CRON_MEMORY_MAINTAIN.md from the workspace root directory and execute all phases defined in it.",
        "timeoutSeconds": 3600
      },
      "delivery": {
        "mode": "announce",
        "channel": "lark",
        "to": "${TONY_OPEN_ID}",
        "bestEffort": true
      },
      "state": {}
    }
  ]
}
ENDJSON

echo "Created $JOBS_FILE with daily-memory-maintain job (env=$ENV, delivery to $TONY_OPEN_ID)"
echo "Restart gateway to pick up new jobs."
