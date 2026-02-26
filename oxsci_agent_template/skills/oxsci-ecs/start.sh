#!/bin/bash
# Start an ECS service

SERVICE_NAME="${1:-platform-test}"
API_BASE="http://data-service-prod.oxsci.internal:8008"

echo "🚀 Starting ECS service: $SERVICE_NAME"

curl -s -X POST "$API_BASE/api/database/v1/system/ecs/$SERVICE_NAME/start" \
  -H "Content-Type: application/json" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('success'):
    print('✅ Service start initiated')
    print(f'   Message: {data.get(\"message\", \"N/A\")}')
else:
    print('❌ Failed to start service')
    print(f'   Error: {data.get(\"error\", \"Unknown\")}')
" 2>/dev/null || echo "Failed to call API"
