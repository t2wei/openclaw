#!/bin/bash
# OxSci Knowledge Update Helper
# Usage: ./update-knowledge.sh <action> <args>
#
# Actions:
#   create_snippet <title> <file_path> [category] [tags] [description]
#   update_snippet <snippet_id> <file_path>
#   create_knowledge <name> <title> <snippet_ids...>
#   add_to_scenario <scenario_name> <knowledge_id>

set -e

DATA_URL="http://data-service-prod.oxsci.internal:8008/api/database/v1"

ACTION="${1}"
shift

case "$ACTION" in
  create_snippet)
    TITLE="${1}"
    FILE_PATH="${2}"
    CATEGORY="${3:-general}"
    TAGS="${4:-}"
    DESCRIPTION="${5:-}"
    
    if [[ -z "$TITLE" || -z "$FILE_PATH" ]]; then
      echo "Usage: $0 create_snippet <title> <file_path> [category] [tags] [description]"
      exit 1
    fi
    
    if [[ ! -f "$FILE_PATH" ]]; then
      echo "Error: File not found: $FILE_PATH"
      exit 1
    fi
    
    # Parse tags as JSON array
    if [[ -n "$TAGS" ]]; then
      TAGS_JSON=$(echo "$TAGS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split(',')))")
    else
      TAGS_JSON="[]"
    fi
    
    # Create snippet
    SNIPPET_DATA=$(cat <<EOF
{
  "name": "$(basename "$FILE_PATH" .md)",
  "title": "$TITLE",
  "category": "$CATEGORY",
  "tags": $TAGS_JSON,
  "description": "$DESCRIPTION",
  "status": "active"
}
EOF
)
    
    echo "Creating snippet..."
    RESULT=$(curl -s -X POST "$DATA_URL/knowledge-snippets/" \
      -H "Content-Type: application/json" \
      -d "$SNIPPET_DATA")
    
    SNIPPET_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
    
    if [[ -z "$SNIPPET_ID" ]]; then
      echo "Error creating snippet:"
      echo "$RESULT" | python3 -m json.tool
      exit 1
    fi
    
    echo "Snippet created: $SNIPPET_ID"
    
    # Upload content
    echo "Uploading content from $FILE_PATH..."
    curl -X POST "$DATA_URL/knowledge-snippets/$SNIPPET_ID/upload" \
      -F "file=@$FILE_PATH"
    
    echo ""
    echo "✅ Snippet created and uploaded successfully!"
    echo "Snippet ID: $SNIPPET_ID"
    ;;
    
  update_snippet)
    SNIPPET_ID="${1}"
    FILE_PATH="${2}"
    
    if [[ -z "$SNIPPET_ID" || -z "$FILE_PATH" ]]; then
      echo "Usage: $0 update_snippet <snippet_id> <file_path>"
      exit 1
    fi
    
    if [[ ! -f "$FILE_PATH" ]]; then
      echo "Error: File not found: $FILE_PATH"
      exit 1
    fi
    
    echo "Updating snippet $SNIPPET_ID with content from $FILE_PATH..."
    curl -X POST "$DATA_URL/knowledge-snippets/$SNIPPET_ID/upload" \
      -F "file=@$FILE_PATH"
    
    echo ""
    echo "✅ Snippet updated successfully!"
    ;;
    
  create_knowledge)
    NAME="${1}"
    TITLE="${2}"
    shift 2
    SNIPPET_IDS=("$@")
    
    if [[ -z "$NAME" || -z "$TITLE" || ${#SNIPPET_IDS[@]} -eq 0 ]]; then
      echo "Usage: $0 create_knowledge <name> <title> <snippet_id1> [snippet_id2 ...]"
      exit 1
    fi
    
    # Build snippet_ids JSON array
    SNIPPET_IDS_JSON=$(printf '%s\n' "${SNIPPET_IDS[@]}" | python3 -c "import sys,json; print(json.dumps([s.strip() for s in sys.stdin]))")
    
    KNOWLEDGE_DATA=$(cat <<EOF
{
  "name": "$NAME",
  "title": "$TITLE",
  "snippet_ids": $SNIPPET_IDS_JSON,
  "status": "active"
}
EOF
)
    
    echo "Creating knowledge..."
    RESULT=$(curl -s -X POST "$DATA_URL/knowledge/" \
      -H "Content-Type: application/json" \
      -d "$KNOWLEDGE_DATA")
    
    KNOWLEDGE_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
    
    if [[ -z "$KNOWLEDGE_ID" ]]; then
      echo "Error creating knowledge:"
      echo "$RESULT" | python3 -m json.tool
      exit 1
    fi
    
    echo "✅ Knowledge created successfully!"
    echo "Knowledge ID: $KNOWLEDGE_ID"
    echo "Name: $NAME"
    ;;
    
  add_to_scenario)
    SCENARIO_NAME="${1}"
    KNOWLEDGE_ID="${2}"
    
    if [[ -z "$SCENARIO_NAME" || -z "$KNOWLEDGE_ID" ]]; then
      echo "Usage: $0 add_to_scenario <scenario_name> <knowledge_id>"
      exit 1
    fi
    
    # Find scenario ID
    echo "Finding scenario: $SCENARIO_NAME..."
    SCENARIO_RESULT=$(curl -s -X POST "$DATA_URL/knowledge-scenarios/list" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$SCENARIO_NAME\"}")
    
    SCENARIO_ID=$(echo "$SCENARIO_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['items'][0]['id'])" 2>/dev/null)
    
    if [[ -z "$SCENARIO_ID" ]]; then
      echo "Error: Scenario not found: $SCENARIO_NAME"
      exit 1
    fi
    
    # Get current knowledge_ids
    CURRENT_KNOWLEDGE_IDS=$(echo "$SCENARIO_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['data']['items'][0]['knowledge_ids']))")
    
    # Append new knowledge_id
    NEW_KNOWLEDGE_IDS=$(echo "$CURRENT_KNOWLEDGE_IDS" | python3 -c "import sys,json; ids=json.load(sys.stdin); ids.append('$KNOWLEDGE_ID'); print(json.dumps(ids))")
    
    # Update scenario using batch API
    echo "Adding knowledge to scenario..."
    UPDATE_DATA=$(cat <<EOF
{
  "scenarios": [
    {
      "id": "$SCENARIO_ID",
      "knowledge_ids": $NEW_KNOWLEDGE_IDS
    }
  ]
}
EOF
)
    
    curl -s -X PUT "$DATA_URL/knowledge-scenarios/batch" \
      -H "Content-Type: application/json" \
      -d "$UPDATE_DATA" > /dev/null
    
    echo "✅ Knowledge added to scenario successfully!"
    echo "Scenario: $SCENARIO_NAME ($SCENARIO_ID)"
    echo "Knowledge ID: $KNOWLEDGE_ID"
    ;;
    
  *)
    echo "Usage: $0 <action> <args>"
    echo ""
    echo "Actions:"
    echo "  create_snippet <title> <file_path> [category] [tags] [description]"
    echo "  update_snippet <snippet_id> <file_path>"
    echo "  create_knowledge <name> <title> <snippet_id1> [snippet_id2 ...]"
    echo "  add_to_scenario <scenario_name> <knowledge_id>"
    echo ""
    echo "Examples:"
    echo "  $0 create_snippet 'Deployment Guide' /path/to/guide.md deployment 'mcp,ecs'"
    echo "  $0 update_snippet abc123 /path/to/updated-guide.md"
    echo "  $0 create_knowledge 'mcp-deployment' 'MCP Service Deployment' snippet-id-1 snippet-id-2"
    echo "  $0 add_to_scenario 'devops-deployment' knowledge-id"
    exit 1
    ;;
esac
