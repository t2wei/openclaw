#!/bin/bash
# Get Feishu group members via API
# Usage: get_members.sh <chat_id>

set -e

CHAT_ID="${1:-}"
if [ -z "$CHAT_ID" ]; then
    echo "Usage: $0 <chat_id>" >&2
    exit 1
fi

# Strip 'chat:' prefix if present
CHAT_ID="${CHAT_ID#chat:}"

# Get config path
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/opt/openclaw/config-prod.json}"

# Extract app credentials (fallback to simple grep if jq unavailable)
if command -v jq >/dev/null 2>&1; then
    APP_ID=$(cat "$CONFIG_PATH" | jq -r '.channels.feishu.accounts.default.appId')
    APP_SECRET=$(cat "$CONFIG_PATH" | jq -r '.channels.feishu.accounts.default.appSecret')
else
    APP_ID=$(grep -oP '"appId"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
    APP_SECRET=$(grep -oP '"appSecret"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
fi

# Get tenant access token
TOKEN_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}")

if command -v jq >/dev/null 2>&1; then
    TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.tenant_access_token')
else
    TOKEN=$(echo "$TOKEN_RESPONSE" | grep -oP '"tenant_access_token"\s*:\s*"\K[^"]+')
fi

# Get group members
curl -s -X GET \
  "https://open.feishu.cn/open-apis/im/v1/chats/${CHAT_ID}/members" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
