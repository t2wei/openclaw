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
  dev)
    TONY_OPEN_ID="ou_edc6f66e761b5706a3b47b38102f9630"
    JOBS_ENABLED=false
    ;;
  prod)
    TONY_OPEN_ID="ou_63843179615e32306ec9ad752cd8fe34"
    JOBS_ENABLED=true
    ;;
  *)    echo "Error: env must be dev or prod"; exit 1 ;;
esac

mkdir -p "$CRON_DIR"

# Check which jobs already exist
HAVE_MEMORY_MAINTAIN=false
HAVE_SESSION_REVIEW=false
if [ -f "$JOBS_FILE" ]; then
  grep -q '"daily-memory-maintain"' "$JOBS_FILE" && HAVE_MEMORY_MAINTAIN=true
  grep -q '"daily-session-review"' "$JOBS_FILE" && HAVE_SESSION_REVIEW=true
fi

if $HAVE_MEMORY_MAINTAIN && $HAVE_SESSION_REVIEW; then
  echo "All jobs already exist in $JOBS_FILE, skipping."
  exit 0
fi

NOW_MS=$(date +%s)000

# Always write full jobs file (gateway reads it as a whole)
cat > "$JOBS_FILE" << ENDJSON
{
  "jobs": [
    {
      "id": "daily-session-review",
      "name": "Daily Session Review",
      "description": "Scan past 24h sessions, extract missed knowledge to daily log, generate daily work report",
      "enabled": ${JOBS_ENABLED},
      "createdAtMs": ${NOW_MS},
      "updatedAtMs": ${NOW_MS},
      "schedule": {
        "kind": "cron",
        "expr": "30 20 * * *",
        "tz": "UTC"
      },
      "sessionTarget": "isolated",
      "wakeMode": "now",
      "payload": {
        "kind": "agentTurn",
        "message": "Read the file CRON_SESSION_REVIEW.md from the workspace root directory and execute all phases defined in it.",
        "timeoutSeconds": 3600
      },
      "delivery": {
        "mode": "announce",
        "channel": "lark",
        "to": "${TONY_OPEN_ID}",
        "bestEffort": true
      },
      "state": {}
    },
    {
      "id": "daily-memory-maintain",
      "name": "Daily Memory Maintenance",
      "description": "Daily consolidation: daily log → detail extraction, SELF.md overflow, KB promotion, docs cleanup",
      "enabled": ${JOBS_ENABLED},
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

echo "Created $JOBS_FILE with cron jobs (env=$ENV, enabled=$JOBS_ENABLED, delivery to $TONY_OPEN_ID):"
echo "  - daily-session-review  (20:30 UTC = 04:30 CST+8)"
echo "  - daily-memory-maintain (21:00 UTC = 05:00 CST+8)"
echo "Restart gateway to pick up new jobs."
