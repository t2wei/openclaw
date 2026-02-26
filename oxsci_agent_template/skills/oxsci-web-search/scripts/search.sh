#!/bin/bash
# Usage: ./search.sh "your query" [max_results] [search_depth]

QUERY="${1:?Query required}"
MAX_RESULTS="${2:-5}"
SEARCH_DEPTH="${3:-basic}"

curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"web_search\",
      \"arguments\": {
        \"query\": \"$QUERY\",
        \"max_results\": $MAX_RESULTS,
        \"search_depth\": \"$SEARCH_DEPTH\"
      }
    },
    \"id\": 1
  }" | jq -r '.result.content[] | select(.type=="text") | .text'
