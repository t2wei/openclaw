#!/bin/bash
# Start an ECS service and wait until healthy

SERVICE_NAME="${1:-platform-test}"
API_BASE="http://data-service-prod.oxsci.internal:8008"

echo "🚀 Starting ECS service and waiting for health: $SERVICE_NAME"

curl -s -X POST "$API_BASE/api/database/v1/ecs/start-and-wait" \
  -H "Content-Type: application/json" \
  -d "{\"service_name\": \"$SERVICE_NAME\"}" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('success'):
    print('✅ Service started and healthy')
    print(f'   Message: {data.get(\"message\", \"N/A\")}')
    print(f'   Duration: {data.get(\"duration_seconds\", \"N/A\")}s')
else:
    print('❌ Failed to start service or health check timeout')
    print(f'   Error: {data.get(\"error\", \"Unknown\")}')
    sys.exit(1)
" 2>/dev/null || echo "Failed to call API"
