---
name: oxsci-web-search
description: "Deep web search via Tavily API through MCP. Supports advanced search depth, domain filtering, and full-text content extraction. Use for research, troubleshooting, and competitive analysis."
---

# OxSci Web Search Skill

通过 MCP Team Collaboration 调用 Tavily API 进行深度网页搜索。

## 服务地址

- **Prod**: `http://mcp-team-collaboration-prod.oxsci.internal:8060`
- **Test**: `http://mcp-team-collaboration-test.oxsci.internal:8060`
- **协议**: JSONRPC over HTTP

## 工具：web_search

执行深度网页搜索，返回相关网页的标题、URL、内容摘要和完整文本。

### 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | ✅ | - | 搜索关键词 |
| `max_results` | integer | ❌ | 5 | 最多返回结果数(1-10) |
| `search_depth` | string | ❌ | "basic" | 搜索深度: "basic" 或 "advanced" |
| `include_domains` | array[string] | ❌ | [] | 仅搜索这些域名 |
| `exclude_domains` | array[string] | ❌ | [] | 排除这些域名 |

### 返回字段

每个结果包含：
- `title`: 页面标题
- `url`: 页面链接
- `content`: 简短摘要
- `raw_content`: 完整页面文本（可选）
- `score`: 相关度评分

## 使用示例

### 基础搜索

```bash
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "Claude AI latest features 2025",
        "max_results": 5
      }
    },
    "id": 1
  }' | jq .
```

### 深度搜索

```bash
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "AWS ECS Fargate deployment best practices",
        "max_results": 3,
        "search_depth": "advanced"
      }
    },
    "id": 1
  }' | jq .
```

### 域名过滤

```bash
# 只搜索 GitHub 和官方文档
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "OpenClaw agent framework",
        "include_domains": ["github.com", "docs.openclaw.ai"],
        "max_results": 5
      }
    },
    "id": 1
  }' | jq .
```

### 排除域名

```bash
# 排除社交媒体
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "Python asyncio tutorial",
        "exclude_domains": ["twitter.com", "facebook.com", "reddit.com"],
        "max_results": 5
      }
    },
    "id": 1
  }' | jq .
```

## 便捷脚本

创建 `search.sh` 快速调用：

```bash
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
```

使用示例：

```bash
chmod +x search.sh
./search.sh "AWS Lambda cold start optimization" 3 advanced
```

## 与 OpenClaw 内置 web_search 的区别

| 特性 | OpenClaw web_search | OxSci MCP web_search |
|------|---------------------|---------------------|
| 搜索引擎 | Brave Search | Tavily (AI 优化) |
| 内容提取 | 标题+摘要 | 标题+摘要+完整文本 |
| 深度模式 | ❌ | ✅ advanced |
| 域名过滤 | ❌ | ✅ include/exclude |
| 适用场景 | 快速查询 | 研究+内容分析 |

## 使用场景

1. **技术调研** - 搜索最新技术方案、API 文档
2. **问题排查** - 查找 Stack Overflow、GitHub Issues
3. **竞品分析** - 收集行业信息
4. **内容生成** - 搜索参考资料用于写作

## API Key 配置

Tavily API Key 存储在 AWS SSM Parameter Store:
- Test: `/test/TAVILY_API_KEY`
- Prod: `/prod/TAVILY_API_KEY`

由 `oxsci_shared_core.BaseConfig` 自动加载，无需手动配置。

## 实现细节

- **代码位置**: `mcp-team-collaboration/app/tools/tavily_web_search.py`
- **GitHub**: https://github.com/OxSci-AI/mcp-team-collaboration
- **部署**: 通过 GitHub Actions + ECS Deploy
- **文档**: `mcp-team-collaboration/docs/tavily_web_search.md`

## 错误处理

```python
# API Key 未配置
{
  "error": {
    "code": -32603,
    "message": "Tavily API key not configured"
  }
}

# 搜索失败
{
  "error": {
    "code": -32603,
    "message": "Search failed: <error details>"
  }
}
```

## 成本考虑

- Tavily API 按请求计费
- 建议使用 `max_results` 控制成本
- `search_depth: "advanced"` 消耗更多 credits
- 合理使用域名过滤减少无效结果

---

**实现日期**: 2026-02-24  
**部署状态**: ✅ Test & Prod 均已上线  
**维护者**: oxsciClaw
