#!/bin/bash
# Get Feishu user info by open_id (ou_xxx)
# Usage: get_user.sh <open_id> [id_type]
# id_type: open_id (default), union_id, user_id

set -e

OPEN_ID="${1:-}"
ID_TYPE="${2:-open_id}"

if [ -z "$OPEN_ID" ]; then
    echo "Usage: $0 <open_id> [id_type]" >&2
    echo "  id_type: open_id (default), union_id, user_id" >&2
    exit 1
fi

# Get config path
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/opt/openclaw/config-dev.json}"

# Extract JSON string field without jq
json_field() { grep -oP "\"$1\"\s*:\s*\"\K[^\"]*" <<< "$2" | head -1; }

CONFIG=$(cat "$CONFIG_PATH")
APP_ID=$(json_field appId "$CONFIG")
APP_SECRET=$(json_field appSecret "$CONFIG")

# Get tenant access token
TOKEN_RESP=$(curl -s -X POST "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}")
TOKEN=$(json_field tenant_access_token "$TOKEN_RESP")

# Get user info
curl -s -X GET \
  "https://open.larksuite.com/open-apis/contact/v3/users/${OPEN_ID}?user_id_type=${ID_TYPE}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
