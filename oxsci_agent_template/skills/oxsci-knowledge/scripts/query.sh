#!/bin/bash
# OxSci Knowledge Query Helper
# Usage: ./query.sh <tool> [args_json]
#
# Examples:
#   ./query.sh list_scenarios
#   ./query.sh search '{"query":"deployment"}'
#   ./query.sh get_snippet <snippet_id>

MCP_URL="http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc"
DATA_URL="http://data-service-prod.oxsci.internal:8008/api/database/v1"

TOOL="${1:-list_scenarios}"
ARGS="${2:-{}}"

# Try MCP first, fallback to Data Service
case "$TOOL" in
  search)
    curl -s -X POST "$DATA_URL/knowledge/search" \
      -H "Content-Type: application/json" \
      -d "$ARGS"
    ;;
  get_snippet)
    curl -s "$DATA_URL/knowledge-snippets/$ARGS/content"
    ;;
  *)
    # Try MCP
    result=$(curl -s --connect-timeout 3 -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS},\"id\":1}" 2>/dev/null)
    
    if echo "$result" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('content',[{}])[0].get('text','{}'))"
    else
      echo "MCP unavailable, use: ./query.sh search '{\"query\":\"...\"}'"
    fi
    ;;
esac
