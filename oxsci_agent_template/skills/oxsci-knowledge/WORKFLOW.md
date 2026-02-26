# OxSci 知识管理工作流程

**建立日期**: 2026-02-24  
**状态**: ✅ 已验证可用

---

## 核心理念

> "时间线知识（会议、文档） → 领域知识（MCP Knowledge）  
> 前者是原始记录，后者是提炼精华，两者互为投影，永远保持最新。"

---

## 完整工作流程

### 阶段 1: 信息获取

#### 1.1 会议纪要

**来源**: Plaud / Granola

**方式 A: 手动发送**（当前）
- Tony/shumiao 发会议链接或文件
- oxsciClaw 接收处理

**方式 B: API 集成**（未来，等 OAuth 开放）
- 自动拉取最新会议记录
- 定期同步

**工具**:
- Plaud: 需要 OAuth API（目前 waitlist）
- Granola: `browser-extract` skill（需要公开链接或登录）

#### 1.2 飞书文档

**工具**: 
- `feishu_doc` — 读取飞书文档
- `feishu_wiki` — 读取知识库
- `feishu_drive` — 列出文档

**流程**:
```bash
# 1. Tony/shumiao 发飞书链接
https://pjpa9v2mgv71.jp.larksuite.com/wiki/YVKFwxsrJiUqMnkBZCvjVTvGpHd

# 2. 提取 token
wiki_token = "YVKFwxsrJiUqMnkBZCvjVTvGpHd"
doc_token = "TNRVdGE05oLBaKxfYZdjyjEypYd"

# 3. 调用 API
feishu_wiki(action="get", token=wiki_token)
feishu_doc(action="read", doc_token=doc_token)
```

#### 1.3 动态网页

**工具**: `browser-extract` skill

**适用场景**:
- JS 渲染的页面（Granola, Plaud 等）
- 需要登录的页面（需要公开访问或提前登录）

**示例**:
```bash
curl -X POST http://mcp-browser.oxsci.internal:8066/extract \
  -d '{"url": "https://notes.granola.ai/t/xxx"}'
```

---

### 阶段 2: 本地归档

**目的**: 保留时间线记录，不丢失原始信息

**归档位置**:

```
/opt/openclaw/workspace/memory/
├── meetings/              # 会议纪要
│   └── YYYY-MM-DD-{topic}.md
├── docs/                  # 重要文档
│   └── {source}-{topic}.md
└── YYYY-MM-DD.md          # 当日日记
```

**命名规范**:
- 会议: `2026-02-04-minus-product-strategy.md`
- 文档: `oxsci-agents-archive.md`
- 日记: `2026-02-24.md`

**内容结构**:
- 标题 + 元信息（日期、来源、参与者）
- 核心决策 / 关键讨论
- 待办事项（如有）
- 知识提炼（可复用的原则/经验）

---

### 阶段 3: 知识提炼

**判断标准**: 什么值得推送到 MCP？

#### ✅ 应该推送

| 类型 | 示例 | 理由 |
|------|------|------|
| **可复用的原则** | "流程清晰性 > 操作便捷性" | 跨项目适用 |
| **架构模式** | 领域路由架构 | 其他 agent 可借鉴 |
| **最佳实践** | Token 优化策略 | 降本增效 |
| **技术方案** | Adaptive Evidence Extraction | 解决通用问题 |
| **决策依据** | Cap Table 规划重要性 | 避免重复踩坑 |

#### ❌ 暂不推送

| 类型 | 示例 | 理由 |
|------|------|------|
| **一次性任务** | "修复 bug #123" | 无复用价值 |
| **临时决定** | "本周暂停 feature X" | 时效性强 |
| **个人经历** | "我配置炸了一次" | 个人 memory |
| **过于具体** | "某个函数的参数" | 查代码更快 |

---

### 阶段 4: MCP Knowledge 推送

#### 4.1 知识结构设计

**三层架构**:

```
Scenario (场景/角色)
  ├─ Knowledge (主题)
  │   ├─ Snippet v1 (内容片段 + 版本)
  │   ├─ Snippet v2
  │   └─ ...
```

**Scenario 命名规范**:
- `oxsci-{domain}` — 按领域分类
  - `oxsci-product-strategy` — 产品策略
  - `oxsci-agent-architecture` — Agent 架构
  - `oxsci-backend-engineering` — 后端工程

**Knowledge 命名规范**:
- `{topic}-{aspect}` — 主题-方面
  - `academic-platform-design-principles` — 学术平台设计原则
  - `multi-agent-orchestration` — 多 Agent 编排
  - `token-optimization-strategies` — Token 优化策略

**Snippet 命名规范**:
- `{pattern}-{specific}` — 模式-具体
  - `clarity-over-convenience` — 清晰性优先原则
  - `field-based-routing-architecture` — 领域路由架构

#### 4.2 推送脚本

**位置**: `/opt/openclaw/workspace/skills/oxsci-knowledge/push.sh`

**基本流程**:

```python
# 1. 创建 Scenario
scenario_id = create_scenario(
    name="oxsci-product-strategy",
    title="OxSci 产品策略",
    description="产品设计原则、用户体验..."
)

# 2. 创建 Knowledge
knowledge_id = create_knowledge(
    name="academic-platform-design",
    scenario_name="oxsci-product-strategy",
    description="学术平台设计的核心原则"
)

# 3. 创建 Snippet
snippet_id = create_snippet(
    name="clarity-over-convenience",
    knowledge_name="academic-platform-design",
    status="active"
)

# 4. 上传内容
upload_snippet_content(snippet_id, "content.md")

# 5. 关联 IDs
update_knowledge(knowledge_id, snippet_ids=[snippet_id])
update_scenario(scenario_id, knowledge_ids=[knowledge_id])

# 6. 激活
activate_all()
```

#### 4.3 内容格式

**Markdown 模板**:

```markdown
# {知识点标题}

**来源**: {会议/文档名称} ({日期})  
**适用场景**: {什么时候用}

## 问题

{这个知识解决什么问题}

## 解决方案

{具体怎么做}

### 实现示例

```{language}
{代码或配置示例}
\`\`\`

## 效果

{带来什么改善，最好有数据}

## 适用条件

- ✅ {什么情况下适用}
- ❌ {什么情况下不适用}

## 相关知识

- {相关的其他 snippet}
\`\`\`

---

### 阶段 5: 验证与迭代

#### 5.1 MCP 查询验证

```bash
# 列出所有 scenarios
curl -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_scenarios"},"id":1}'

# 获取 scenario 的 knowledge
curl -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_scenario_knowledge","arguments":{"scenario_name":"oxsci-product-strategy"}},"id":1}'

# 获取具体 knowledge 内容
curl -X POST http://mcp-team-collaboration-prod.oxsci.internal:8060/jsonrpc \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_knowledge","arguments":{"knowledge_names":["academic-platform-design"]}},"id":1}'
```

#### 5.2 持续优化

**每周回顾**:
1. 哪些 snippet 被频繁查询？（说明有用）
2. 哪些 snippet 从未被用？（考虑归档或删除）
3. 哪些 knowledge 需要拆分/合并？

**版本管理**:
- 新的会议/文档有更新 → 创建 Snippet v2
- 旧版本保留（不删除，保持时间线）
- 在 Snippet 内容里标注版本和更新原因

**示例**:
```markdown
# 流程清晰性优于操作便捷性

**版本**: v2  
**更新日期**: 2026-03-10  
**更新原因**: 根据 Minus 产品 beta 测试反馈，补充了用户体验平衡策略

## 原则（v1 内容保留）

...

## 2026-03 更新：用户体验平衡

根据 beta 测试，发现...
```

---

## 关键原则

### 1. 时间线不丢失

- ✅ 会议纪要原文保留在 `memory/meetings/`
- ✅ MCP snippet 标注来源和日期
- ✅ 版本化管理，旧版本不删除

### 2. 知识可消费

- ✅ Scenario/Knowledge/Snippet 结构清晰
- ✅ 内容自包含（有背景、示例、适用条件）
- ✅ 其他 agent 可通过 MCP 查询使用

### 3. 持续迭代

- ✅ 根据实际使用反馈调整分类
- ✅ 淘汰过时/无用的知识
- ✅ 提炼新的模式

### 4. 边界清晰

| 层级 | 内容 | 用途 |
|------|------|------|
| **MEMORY.md** | 个人经历、血泪教训 | oxsciClaw 的个人决策 |
| **memory/meetings/** | 会议纪要原文 | 时间线归档 |
| **memory/docs/** | 重要文档 | 参考资料 |
| **MCP Knowledge** | 可复用的领域知识 | 跨 agent/服务共享 |

---

## 工具清单

| 工具 | 用途 | 状态 |
|------|------|------|
| `feishu_doc` | 读取飞书文档 | ✅ |
| `feishu_wiki` | 读取知识库 | ✅ |
| `feishu_drive` | 列出文档 | ✅ |
| `browser-extract` | 提取动态页面 | ✅ |
| `web_fetch` | 提取静态页面 | ✅ |
| Data Service API | CRUD MCP Knowledge | ✅ |
| MCP JSONRPC | 查询 Knowledge | ⚠️ 待验证 |

---

## 常见问题

### Q: 如何判断一个知识点是否值得推送？

**A**: 问自己 3 个问题：
1. 其他人/agent 遇到类似问题时，这个知识有用吗？
2. 这个知识会过时吗？（如果很快过时，不推送）
3. 这个知识是具体实现还是通用模式？（模式推送，实现不推送）

### Q: Scenario 怎么分类比较好？

**A**: 优先按**领域/职能**分类，而非按**项目**分类：
- ✅ `oxsci-agent-architecture` (跨项目适用)
- ❌ `minus-product-design` (项目特定)

但如果某个项目有大量独特知识，可以单独建 scenario。

### Q: 多久更新一次 MCP Knowledge？

**A**: 
- **会议纪要**: 每次会议后立即整理 → 当天或次日推送
- **文档**: 重要文档发布后 1-2 天内处理
- **日常经验**: 每周五回顾本周，提炼 1-2 个 snippet

### Q: 如何避免 MCP Knowledge 变成垃圾场？

**A**: 
- 每月回顾一次，删除无用 snippet
- 合并重复/相似的 knowledge
- 保持 Scenario 数量在 10 个以内（太多说明分类有问题）

---

## 后续优化方向

1. **自动化推送** — 会议纪要 → 自动提取关键知识 → 草稿 snippet
2. **知识图谱** — snippet 之间的关联关系可视化
3. **使用统计** — 跟踪哪些知识被频繁查询
4. **质量评分** — 其他 agent 使用后反馈有用程度

---

**维护者**: oxsciClaw  
**最后更新**: 2026-02-24
