#!/bin/bash
# OxSci Archive — One-step document archival
#
# Creates a snippet, uploads content, and links it to an existing Knowledge category.
# All archived under the oxsci-archive scenario.
#
# Usage: ./archive.sh <knowledge_name> <title> <file_path> [tags]
#
# Examples:
#   ./archive.sh archived-meeting-notes "Product Meeting 2026-03-01" ./docs/meeting.md "meeting,product"
#   ./archive.sh archived-research "LLM Cost Analysis" ./docs/analysis.md "research,llm"

set -e

DATA_URL="http://data-service-prod.oxsci.internal:8008/api/database/v1"
DEFAULT_PRIORITY=9999

KNOWLEDGE_NAME="${1}"
TITLE="${2}"
FILE_PATH="${3}"
TAGS="${4:-}"

if [[ -z "$KNOWLEDGE_NAME" || -z "$TITLE" || -z "$FILE_PATH" ]]; then
  echo "Usage: $0 <knowledge_name> <title> <file_path> [tags]"
  echo ""
  echo "  knowledge_name  Existing Knowledge category (e.g. archived-meeting-notes)"
  echo "  title           Document title"
  echo "  file_path       Path to markdown file"
  echo "  tags            Comma-separated tags (optional)"
  exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi

# Parse tags
if [[ -n "$TAGS" ]]; then
  TAGS_JSON=$(echo "$TAGS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split(',')))")
else
  TAGS_JSON="[]"
fi

SNIPPET_NAME=$(basename "$FILE_PATH" .md)

# Step 1: Create snippet
echo "Creating snippet..."
SNIPPET_DATA=$(python3 -c "
import json
print(json.dumps({
    'name': '$SNIPPET_NAME',
    'title': '$TITLE',
    'category': 'archive',
    'tags': $TAGS_JSON,
    'description': '$TITLE',
    'status': 'active',
    'priority': $DEFAULT_PRIORITY
}))
")

RESULT=$(curl -s -X POST "$DATA_URL/knowledge-snippets/" \
  -H "Content-Type: application/json" \
  -d "$SNIPPET_DATA")

SNIPPET_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)

if [[ -z "$SNIPPET_ID" ]]; then
  echo "Error creating snippet:"
  echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
  exit 1
fi

echo "Snippet created: $SNIPPET_ID"

# Step 2: Upload content
echo "Uploading content..."
UPLOAD_RESULT=$(curl -s -X POST "$DATA_URL/knowledge-snippets/$SNIPPET_ID/upload" \
  -F "file=@$FILE_PATH")

FILE_ID=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['file_id'])" 2>/dev/null)

if [[ -z "$FILE_ID" ]]; then
  echo "Warning: Upload may have failed:"
  echo "$UPLOAD_RESULT" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_RESULT"
fi

# Step 3: Find Knowledge and link snippet
echo "Linking to Knowledge: $KNOWLEDGE_NAME..."
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
  echo "Create it first: ./manage.sh create_knowledge $KNOWLEDGE_NAME \"Title\""
  echo ""
  echo "Snippet was created but NOT linked. Snippet ID: $SNIPPET_ID"
  exit 1
fi

KNOWLEDGE_ID=$(echo "$KNOWLEDGE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
NEW_SNIPPET_IDS=$(echo "$KNOWLEDGE_DATA" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['snippet_ids']))")

BATCH_RESULT=$(curl -s -X PUT "$DATA_URL/knowledge/batch" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"id\":\"$KNOWLEDGE_ID\",\"snippet_ids\":$NEW_SNIPPET_IDS}]}")

UPDATED=$(echo "$BATCH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['updated'])" 2>/dev/null)

if [[ "$UPDATED" != "1" ]]; then
  echo "Warning: Link may have failed:"
  echo "$BATCH_RESULT" | python3 -m json.tool 2>/dev/null || echo "$BATCH_RESULT"
fi

echo ""
echo "Archived successfully!"
echo "  Snippet ID:  $SNIPPET_ID"
echo "  Knowledge:   $KNOWLEDGE_NAME ($KNOWLEDGE_ID)"
echo "  File:        $FILE_PATH"
echo "  Title:       $TITLE"
