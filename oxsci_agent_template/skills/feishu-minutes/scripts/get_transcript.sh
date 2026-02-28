#!/bin/bash
# Export Lark Minutes transcript text
# Usage: get_transcript.sh <minute_token> [options]
# Options:
#   --speaker    Include speaker names (default: true)
#   --no-speaker Exclude speaker names
#   --timestamp  Include timestamps (default: false)
#   --format     txt (default) or srt

set -e

MINUTE_TOKEN="${1:-}"
NEED_SPEAKER="true"
NEED_TIMESTAMP="false"
FILE_FORMAT="txt"

if [ -z "$MINUTE_TOKEN" ]; then
    echo "Usage: $0 <minute_token> [--speaker|--no-speaker] [--timestamp] [--format txt|srt]" >&2
    exit 1
fi

shift
while [ $# -gt 0 ]; do
    case "$1" in
        --speaker)    NEED_SPEAKER="true" ;;
        --no-speaker) NEED_SPEAKER="false" ;;
        --timestamp)  NEED_TIMESTAMP="true" ;;
        --format)     shift; FILE_FORMAT="$1" ;;
        *)            echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done

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
  "https://open.larksuite.com/open-apis/minutes/v1/minutes/${MINUTE_TOKEN}/transcript?need_speaker=${NEED_SPEAKER}&need_timestamp=${NEED_TIMESTAMP}&file_format=${FILE_FORMAT}" \
  -H "Authorization: Bearer $TOKEN"
