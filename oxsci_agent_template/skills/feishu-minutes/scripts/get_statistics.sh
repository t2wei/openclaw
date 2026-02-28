#!/bin/bash
# Get Lark Minutes statistics by minute_token
# Usage: get_statistics.sh <minute_token> [user_id_type]

set -e

MINUTE_TOKEN="${1:-}"
USER_ID_TYPE="${2:-open_id}"

if [ -z "$MINUTE_TOKEN" ]; then
    echo "Usage: $0 <minute_token> [user_id_type]" >&2
    exit 1
fi

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/opt/openclaw/config-dev.json}"

# Extract JSON string field without jq
json_field() { grep -oP "\"$1\"\s*:\s*\"\K[^\"]*" <<< "$2" | head -1; }

CONFIG=$(cat "$CONFIG_PATH")
APP_ID=$(json_field appId "$CONFIG")
APP_SECRET=$(json_field appSecret "$CONFIG")

TOKEN_RESP=$(curl -s -X POST "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}")
TOKEN=$(json_field tenant_access_token "$TOKEN_RESP")

curl -s -X GET \
  "https://open.larksuite.com/open-apis/minutes/v1/minutes/${MINUTE_TOKEN}/statistics?user_id_type=${USER_ID_TYPE}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
