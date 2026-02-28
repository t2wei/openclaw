#!/bin/bash
# Search Feishu/Lark users by name
# Usage: search_user.sh <name> [department_id]
# department_id: 0 for root (default), or specific department ID

set -e

NAME="${1:-}"
DEPT_ID="${2:-0}"

if [ -z "$NAME" ]; then
    echo "Usage: $0 <name> [department_id]" >&2
    echo "  department_id: 0 for root (default)" >&2
    exit 1
fi

# Get config path
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/opt/openclaw/config-dev.json}"

# Extract app credentials and domain
if command -v jq >/dev/null 2>&1; then
    APP_ID=$(jq -r '.channels.feishu.appId' "$CONFIG_PATH")
    APP_SECRET=$(jq -r '.channels.feishu.appSecret' "$CONFIG_PATH")
    DOMAIN=$(jq -r '.channels.feishu.domain // "feishu"' "$CONFIG_PATH")
else
    APP_ID=$(grep -oP '"appId"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
    APP_SECRET=$(grep -oP '"appSecret"\s*:\s*"\K[^"]+' "$CONFIG_PATH" | head -1)
    DOMAIN="feishu"
fi

# Set API base URL based on domain
if [ "$DOMAIN" = "lark" ]; then
    API_BASE="https://open.larksuite.com/open-apis"
else
    API_BASE="https://open.feishu.cn/open-apis"
fi

# Get tenant access token
TOKEN=$(curl -s -X POST "${API_BASE}/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" | jq -r '.tenant_access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "Error: Failed to get access token" >&2
    exit 1
fi

# List users in department and filter by name
# Using page_size=50 and will paginate if needed
PAGE_TOKEN=""
FOUND=0

while true; do
    URL="${API_BASE}/contact/v3/users/find_by_department?department_id=${DEPT_ID}&page_size=50"
    if [ -n "$PAGE_TOKEN" ]; then
        URL="${URL}&page_token=${PAGE_TOKEN}"
    fi
    
    RESPONSE=$(curl -s -X GET "$URL" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")
    
    # Check for errors
    CODE=$(echo "$RESPONSE" | jq -r '.code')
    if [ "$CODE" != "0" ]; then
        echo "$RESPONSE" | jq .
        exit 1
    fi
    
    # Filter users by name (case-insensitive partial match)
    MATCHES=$(echo "$RESPONSE" | jq --arg name "$NAME" '
      .data.items // [] | map(select(.name | test($name; "i")))
    ')
    
    COUNT=$(echo "$MATCHES" | jq 'length')
    if [ "$COUNT" -gt 0 ]; then
        echo "$MATCHES" | jq .
        FOUND=1
    fi
    
    # Check for more pages
    HAS_MORE=$(echo "$RESPONSE" | jq -r '.data.has_more // false')
    if [ "$HAS_MORE" = "true" ]; then
        PAGE_TOKEN=$(echo "$RESPONSE" | jq -r '.data.page_token')
    else
        break
    fi
done

if [ "$FOUND" -eq 0 ]; then
    echo "[]"
fi
