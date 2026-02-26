#!/bin/bash
# Get status of all ECS services

API_BASE="http://data-service-prod.oxsci.internal:8008"

echo "🔍 OxSci ECS Services Status"
echo "=============================="

curl -s -X POST "$API_BASE/api/database/v1/system/ecs/status" \
  -H "Content-Type: application/json" \
  -d '{"cluster": "oxsci-test"}' | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'services' in data:
    for svc in data['services']:
        name = svc.get('name', 'unknown')
        status = svc.get('status', 'unknown')
        running = svc.get('runningCount', 0)
        desired = svc.get('desiredCount', 0)
        emoji = '🟢' if status == 'ACTIVE' and running == desired else '🟡' if status == 'ACTIVE' else '🔴'
        print(f'{emoji} {name}: {status} ({running}/{desired} tasks)')
else:
    print(data)
" 2>/dev/null || echo "Failed to fetch status"
