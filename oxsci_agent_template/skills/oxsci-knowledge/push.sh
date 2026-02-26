#!/bin/bash
# OxSci Knowledge Push - 推送知识到 MCP Knowledge Service
# 使用 Data Service API

set -e

DATA_SERVICE="http://data-service-prod.oxsci.internal:8008"

# 使用方式示例:
# ./push.sh create-snippet "academic-platform-design" "流程清晰性原则" "content.md"

ACTION="$1"
shift

case "$ACTION" in
  create-scenario)
    SCENARIO_NAME="$1"
    TITLE="$2"
    DESCRIPTION="$3"
    
    curl -X POST "$DATA_SERVICE/api/database/v1/knowledge-scenarios/" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"$SCENARIO_NAME\",
        \"title\": \"$TITLE\",
        \"description\": \"$DESCRIPTION\",
        \"applicable_agents\": [\"oxsciClaw\"]
      }"
    ;;
    
  create-knowledge)
    KNOWLEDGE_NAME="$1"
    SCENARIO_NAME="$2"
    DESCRIPTION="$3"
    
    curl -X POST "$DATA_SERVICE/api/database/v1/knowledge/" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"$KNOWLEDGE_NAME\",
        \"scenario_name\": \"$SCENARIO_NAME\",
        \"description\": \"$DESCRIPTION\",
        \"category\": \"product-strategy\"
      }"
    ;;
    
  create-snippet)
    SNIPPET_NAME="$1"
    KNOWLEDGE_NAME="$2"
    CONTENT_FILE="$3"
    
    CONTENT=$(cat "$CONTENT_FILE" | jq -Rs .)
    
    curl -X POST "$DATA_SERVICE/api/database/v1/knowledge-snippets/" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"$SNIPPET_NAME\",
        \"knowledge_name\": \"$KNOWLEDGE_NAME\",
        \"content\": $CONTENT,
        \"category\": \"meeting-insight\",
        \"tags\": [\"2026-02\", \"product-strategy\"]
      }"
    ;;
    
  *)
    echo "Usage: $0 {create-scenario|create-knowledge|create-snippet} [args]"
    exit 1
    ;;
esac
