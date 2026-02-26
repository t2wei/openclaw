---
name: oxsci-knowledge
description: "Query and update the company knowledge base (MCP Team Collaboration). Use for looking up best practices, deployment guides, API docs, and shared team knowledge."
---

# OxSci Knowledge Skill

查询公司知识库（MCP Team Collaboration Server）。

## 服务地址

- **Prod**: `http://mcp-team-collaboration-prod.oxsci.internal:8060`
- **协议**: JSONRPC over HTTP

## 可用工具

### 1. list_scenarios
列出所有可用的知识场景。

```bash
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_scenarios","arguments":{}},"id":1}'
```

### 2. get_scenario_knowledge
获取某个场景下的知识主题列表。

```bash
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_scenario_knowledge","arguments":{"scenario_name":"openclaw-ai-employee"}},"id":1}'
```

### 3. get_knowledge
获取具体知识内容（最多10个）。

```bash
curl -s -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_knowledge","arguments":{"knowledge_names":["openclaw-config-safety"]}},"id":1}'
```

## 现有 Scenarios

| Scenario | 用途 |
|----------|------|
| `oxsci-backend-developer` | 后端开发规范 |
| `agent-developer` | Agent 服务开发 (oma-core) |
| `devops-deployment` | 部署和运维 |
| `data-service-developer` | Data Service 开发 |
| `use-oxsci-mcp-tool` | MCP 工具使用 |
| `openclaw-ai-employee` | ~~我的专属~~ (待重新设计)

## 三层架构

```
Scenario (角色/场景)
  └── Knowledge (主题)
        └── Snippet (内容片段，对 Agent 隐藏)
```

## 全文搜索 (Data Service)

当不知道知识在哪个 scenario/knowledge 里时，直接搜：

```bash
curl -s -X POST http://data-service-prod.oxsci.internal:8008/api/database/v1/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query":"deployment"}'
```

支持过滤：
- `scenario_names`: 限定场景
- `entity_types`: ["snippet", "knowledge", "scenario"]
- `category`: 分类
- `tags`: 标签

## 使用场景

1. **知道关键词但不知道在哪** → 全文搜索
2. **知道场景** → MCP JSONRPC 按层级查
3. **避免重复犯错** → 搜 "config" "safety" 等

## 与本地记忆的区别

| 本地记忆 (MEMORY.md) | 公司知识库 (MCP) |
|---------------------|-----------------|
| 个人经历、对话上下文 | 共享规范、最佳实践 |
| 实时更新 | 结构化、经审核 |
| 私有 | 公司共享 |

---

## 📝 更新 Knowledge（新增！）

使用 `update-knowledge.sh` 脚本（Data Service API）。

### 1. 创建 Snippet + 上传内容

```bash
./update-knowledge.sh create_snippet \
  "MCP Deployment Guide" \
  /opt/openclaw/workspace/oxsci-mcp-deployment-guide.md \
  "devops" \
  "mcp,deployment,ssm" \
  "Complete guide for deploying MCP services"
```

**返回:** Snippet ID（记下来用于下一步）

### 2. 创建 Knowledge（组合多个 Snippets）

```bash
./update-knowledge.sh create_knowledge \
  "mcp-service-deployment" \
  "MCP Service Deployment Guide" \
  <snippet-id-1> \
  [snippet-id-2 ...]
```

**返回:** Knowledge ID

### 3. 添加到 Scenario

```bash
./update-knowledge.sh add_to_scenario \
  "devops-deployment" \
  <knowledge-id>
```

### 4. 更新已有 Snippet

```bash
./update-knowledge.sh update_snippet \
  <snippet-id> \
  /path/to/updated-content.md
```

### 完整示例

```bash
# 创建 snippet
SNIPPET_ID=$(./update-knowledge.sh create_snippet \
  "MCP Deployment Guide" \
  /opt/openclaw/workspace/oxsci-mcp-deployment-guide.md \
  "devops" \
  "mcp,deployment" | grep "Snippet ID:" | cut -d' ' -f3)

# 创建 knowledge
KNOWLEDGE_ID=$(./update-knowledge.sh create_knowledge \
  "mcp-service-deployment" \
  "MCP Service Deployment" \
  "$SNIPPET_ID" | grep "Knowledge ID:" | cut -d' ' -f3)

# 添加到 scenario
./update-knowledge.sh add_to_scenario \
  "devops-deployment" \
  "$KNOWLEDGE_ID"
```

---

## 🔄 定期沉淀经验

**工作流：**
1. 遇到问题 → 解决 → 记录到本地（MEMORY.md, workspace 文档）
2. 定期回顾（每周/每月）→ 提炼共性经验
3. 整理成 Markdown 文档
4. 使用 `update-knowledge.sh` 上传到 Knowledge
5. 其他 AI 员工可以查询学习，避免重复犯错

**适合沉淀的经验：**
- 部署流程和配置规范
- 常见问题和解决方案
- API 使用最佳实践
- 架构设计模式
- 安全注意事项

**不适合放 Knowledge 的内容：**
- 个人对话历史
- 临时调试记录
- 敏感信息（密码、密钥）
- 未经验证的方案
