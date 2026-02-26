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

# Extract app credentials
if command -v jq >/dev/null 2>&1; then
    APP_ID=$(jq -r '.channels.feishu.appId' "$CONFIG_PATH")
    APP_SECRET=$(jq -r '.channels.feishu.appSecret' "$CONFIG_PATH")
else
    APP_ID=$(grep -oP '"appId"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
    APP_SECRET=$(grep -oP '"appSecret"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
fi

# Get tenant access token
TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" | jq -r '.tenant_access_token')

# Get user info
curl -s -X GET \
  "https://open.feishu.cn/open-apis/contact/v3/users/${OPEN_ID}?user_id_type=${ID_TYPE}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
