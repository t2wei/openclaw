#!/bin/bash
# OxSci Archive — Manage Knowledge categories
#
# Usage: ./manage.sh <action> [args]
#
# Actions:
#   create_knowledge <name> <title>          Create a new Knowledge category under oxsci-archive
#   link_snippet <knowledge_name> <snippet_id>  Link an existing snippet to a Knowledge category
#   list                                      List Knowledge categories in oxsci-archive

set -e

DATA_URL="http://data-service-prod.oxsci.internal:8008/api/database/v1"
MCP_URL="http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc"
SCENARIO_NAME="oxsci-archive"
DEFAULT_PRIORITY=9999

ACTION="${1}"
shift 2>/dev/null || true

case "$ACTION" in
  create_knowledge)
    NAME="${1}"
    TITLE="${2}"

    if [[ -z "$NAME" || -z "$TITLE" ]]; then
      echo "Usage: $0 create_knowledge <name> <title>"
      echo ""
      echo "  name   Knowledge name (e.g. archived-research)"
      echo "  title  Human-readable title (e.g. \"Archived Research Reports\")"
      exit 1
    fi

    # Create Knowledge
    echo "Creating Knowledge: $NAME..."
    RESULT=$(curl -s -X POST "$DATA_URL/knowledge/" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$NAME\",\"title\":\"$TITLE\",\"snippet_ids\":[],\"status\":\"active\",\"priority\":$DEFAULT_PRIORITY}")

    KNOWLEDGE_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)

    if [[ -z "$KNOWLEDGE_ID" ]]; then
      echo "Error creating Knowledge:"
      echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
      exit 1
    fi

    echo "Knowledge created: $KNOWLEDGE_ID"

    # Link to scenario
    echo "Linking to scenario: $SCENARIO_NAME..."
    SCENARIO_RESULT=$(curl -s -X POST "$DATA_URL/knowledge-scenarios/list" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$SCENARIO_NAME\"}")

    SCENARIO_UPDATE=$(echo "$SCENARIO_RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d['data']['items']
if not items:
    print('NOT_FOUND')
else:
    item = items[0]
    ids = item['knowledge_ids']
    ids.append('$KNOWLEDGE_ID')
    print(json.dumps({'id': item['id'], 'knowledge_ids': ids}))
" 2>/dev/null)

    if [[ "$SCENARIO_UPDATE" == "NOT_FOUND" ]]; then
      echo "Error: Scenario '$SCENARIO_NAME' not found."
      echo "Knowledge was created but NOT linked to scenario."
      echo "Knowledge ID: $KNOWLEDGE_ID"
      exit 1
    fi

    SCENARIO_ID=$(echo "$SCENARIO_UPDATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    NEW_KNOWLEDGE_IDS=$(echo "$SCENARIO_UPDATE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['knowledge_ids']))")

    curl -s -X PUT "$DATA_URL/knowledge-scenarios/batch" \
      -H "Content-Type: application/json" \
      -d "{\"scenarios\":[{\"id\":\"$SCENARIO_ID\",\"knowledge_ids\":$NEW_KNOWLEDGE_IDS}]}" > /dev/null

    echo ""
    echo "Knowledge created and linked!"
    echo "  Name:        $NAME"
    echo "  ID:          $KNOWLEDGE_ID"
    echo "  Scenario:    $SCENARIO_NAME"
    ;;

  link_snippet)
    KNOWLEDGE_NAME="${1}"
    SNIPPET_ID="${2}"

    if [[ -z "$KNOWLEDGE_NAME" || -z "$SNIPPET_ID" ]]; then
      echo "Usage: $0 link_snippet <knowledge_name> <snippet_id>"
      exit 1
    fi

    echo "Finding Knowledge: $KNOWLEDGE_NAME..."
    KNOWLEDGE_RESULT=$(curl -s -X POST "$DATA_URL/knowledge/list" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$KNOWLEDGE_NAME\"}")

    KNOWLEDGE_DATA=$(echo "$KNOWLEDGE_RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d['data']['items']
if not items:
    print('NOT_FOUND')
else:
    item = items[0]
    ids = item['snippet_ids']
    ids.append('$SNIPPET_ID')
    print(json.dumps({'id': item['id'], 'snippet_ids': ids}))
" 2>/dev/null)

    if [[ "$KNOWLEDGE_DATA" == "NOT_FOUND" ]]; then
      echo "Error: Knowledge '$KNOWLEDGE_NAME' not found."
      exit 1
    fi

    KNOWLEDGE_ID=$(echo "$KNOWLEDGE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    NEW_SNIPPET_IDS=$(echo "$KNOWLEDGE_DATA" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['snippet_ids']))")

    curl -s -X PUT "$DATA_URL/knowledge/batch" \
      -H "Content-Type: application/json" \
      -d "{\"items\":[{\"id\":\"$KNOWLEDGE_ID\",\"snippet_ids\":$NEW_SNIPPET_IDS}]}" > /dev/null

    echo "Snippet linked!"
    echo "  Knowledge: $KNOWLEDGE_NAME ($KNOWLEDGE_ID)"
    echo "  Snippet:   $SNIPPET_ID"
    ;;

  list)
    echo "Knowledge categories in $SCENARIO_NAME:"
    echo ""
    curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_scenario_knowledge\",\"arguments\":{\"scenario_name\":\"$SCENARIO_NAME\"}},\"id\":1}" \
      | python3 -c "
import sys, json
result = json.load(sys.stdin)
text = result['result']['content'][0]['text']
data = json.loads(text)
data.pop('_oma_context', None)
if not data:
    print('  (empty)')
else:
    for name, desc in data.items():
        print(f'  {name}: {desc or \"(no description)\"}')
" 2>/dev/null || echo "  Error querying MCP. Check service status."
    ;;

  *)
    echo "Usage: $0 <action> [args]"
    echo ""
    echo "Actions:"
    echo "  create_knowledge <name> <title>             Create a new Knowledge category"
    echo "  link_snippet <knowledge_name> <snippet_id>  Link existing snippet to Knowledge"
    echo "  list                                         List Knowledge categories"
    echo ""
    echo "Examples:"
    echo "  $0 create_knowledge archived-research \"Archived Research Reports\""
    echo "  $0 link_snippet archived-research abc123-def456"
    echo "  $0 list"
    exit 1
    ;;
esac
