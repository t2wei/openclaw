# OxSci 每日工作经验提炼与总结流程

**设计日期**: 2026-02-24  
**目标**: 从大量 session 中高效提炼可复用知识 + 生成每日工作总结

---

## 核心挑战

### 1. 数据量大
- 每天多位员工 × 多个 session
- OpenClaw session + Claude Code session
- 不可能逐条细读所有对话

### 2. 信噪比低
- 大部分对话是日常操作（"帮我写个函数"）
- 少部分对话包含血泪教训（"配置炸了，怎么恢复"）

### 3. 双重目标
- **知识沉淀** — 可复用的经验 → MCP Knowledge
- **工作总结** — 个人当日工作记录 → 飞书文档/邮件

---

## 设计方案：两阶段漏斗 + 智能采样

```
[所有 session] 
    ↓
┌─────────────────────────────────────┐
│ Phase 1: 智能过滤（只读 prompt）     │  ← 轻量级，快速
│ - 关键词匹配                         │
│ - 提示词分类                         │
│ - 优先级评分                         │
└─────────────────────────────────────┘
    ↓
[高价值 session 候选列表]
    ↓
┌─────────────────────────────────────┐
│ Phase 2: 深度提炼（读完整对话）     │  ← 精准，有针对性
│ - 识别问题-解决模式                  │
│ - 提取血泪教训                       │
│ - 生成可复用 snippet                 │
└─────────────────────────────────────┘
    ↓
[知识库 snippet] + [每日总结]
```

---

## Phase 1: 智能过滤（Prompt-Based Filtering）

### 1.1 数据来源

#### OpenClaw Session
```python
# 使用 sessions_list 获取所有 session
sessions = sessions_list(
    activeMinutes=1440,  # 过去 24 小时
    kinds=["feishu:p2p", "feishu:group"],
    messageLimit=1  # 只拿最后 1 条消息的 prompt
)
```

#### Claude Code Session
**方式 A: 用户主动提交**（推荐）
```bash
# 用户在本地执行
cd ~/.claude/sessions/
ls -t | head -1  # 最新 session
# 发送给 oxsciClaw

# oxsciClaw 接收 .jsonl 文件，只读 user role 的消息
```

**方式 B: 导出功能**（有截断风险）
- 用户在 Claude Code 里点击"导出对话"
- 发给 oxsciClaw
- oxsciClaw 提示："导出可能不完整，建议直接发 .jsonl 文件"

### 1.2 关键词检测

**高价值关键词列表**（可配置）:

```python
HIGH_VALUE_KEYWORDS = {
    # 错误类
    "error": 3.0,
    "failed": 3.0,
    "exception": 2.5,
    "bug": 2.5,
    "fix": 2.0,
    
    # 配置类
    "config": 2.0,
    "deploy": 2.5,
    "setup": 1.5,
    
    # 学习类
    "how to": 2.0,
    "best practice": 3.0,
    "pattern": 2.5,
    "architecture": 2.5,
    
    # 决策类
    "should we": 2.0,
    "design": 2.0,
    "tradeoff": 2.5,
    
    # 血泪教训类
    "mistake": 3.0,
    "lesson": 3.0,
    "avoid": 2.5,
    "warning": 2.5,
}

LOW_VALUE_KEYWORDS = {
    # 常规操作
    "write a function": 0.5,
    "help me": 0.5,
    "please": 0.3,
}
```

### 1.3 提示词分类

**基于首条 user prompt 分类**:

```python
PROMPT_CATEGORIES = {
    "troubleshooting": {
        "patterns": [
            r".*error.*",
            r".*不工作.*",
            r".*failed.*",
            r"为什么.*不.*",
        ],
        "priority": 3.0  # 高优先级
    },
    
    "learning": {
        "patterns": [
            r".*怎么.*",
            r".*如何.*",
            r".*what is.*",
            r".*explain.*",
        ],
        "priority": 2.0  # 中优先级
    },
    
    "design_discussion": {
        "patterns": [
            r".*设计.*",
            r".*architecture.*",
            r".*应该用.*还是.*",
            r".*trade.*off.*",
        ],
        "priority": 2.5
    },
    
    "routine_coding": {
        "patterns": [
            r"写一个.*函数",
            r"帮我.*代码",
            r"generate.*",
        ],
        "priority": 0.5  # 低优先级
    }
}
```

### 1.4 优先级评分

```python
def calculate_session_priority(session):
    score = 0.0
    
    # 1. 关键词得分
    first_prompt = session['messages'][0]['content']
    for keyword, weight in HIGH_VALUE_KEYWORDS.items():
        if keyword in first_prompt.lower():
            score += weight
    
    # 2. 分类得分
    for category, config in PROMPT_CATEGORIES.items():
        for pattern in config['patterns']:
            if re.match(pattern, first_prompt, re.I):
                score += config['priority']
                break
    
    # 3. 对话长度加成（长对话 = 复杂问题）
    message_count = len(session['messages'])
    if message_count > 10:
        score += 1.5
    elif message_count > 5:
        score += 0.5
    
    # 4. 时间加成（越新越重要）
    age_hours = (now - session['updated_at']).total_seconds() / 3600
    if age_hours < 2:
        score *= 1.2
    
    return score
```

### 1.5 过滤阈值

```python
PRIORITY_THRESHOLDS = {
    "must_review": 3.0,      # ≥3.0 一定要深入读
    "should_review": 2.0,    # 2.0-3.0 可能有价值
    "optional": 1.0,         # 1.0-2.0 时间充裕时看
    "skip": 0.0              # <1.0 跳过
}
```

### 1.6 Phase 1 输出

```json
{
  "high_priority_sessions": [
    {
      "session_key": "agent:main:feishu:p2p:user123",
      "user": "zhiyan",
      "first_prompt": "为什么 ECS 部署后 MCP 连接不上？",
      "category": "troubleshooting",
      "priority_score": 5.5,
      "message_count": 12,
      "created_at": "2026-02-24T18:30:00Z"
    }
  ],
  "medium_priority_sessions": [...],
  "total_sessions_scanned": 50,
  "high_priority_count": 5
}
```

---

## Phase 2: 深度提炼（Deep Extraction）

**只处理 Phase 1 筛选出的高优先级 session**

### 2.1 完整对话读取

```python
for session in high_priority_sessions:
    history = sessions_history(
        sessionKey=session['session_key'],
        limit=100  # 读取完整对话
    )
    
    # 深度分析
    extract_knowledge(history)
```

### 2.2 知识提取 Prompt

```python
KNOWLEDGE_EXTRACTION_PROMPT = """
你是 OxSci 的知识管理员。分析以下对话，提取可复用的知识。

【对话历史】
{conversation_history}

【提取任务】
1. 识别问题-解决模式
   - 用户遇到了什么问题？
   - 根本原因是什么？
   - 最终如何解决的？
   
2. 血泪教训
   - 踩了什么坑？
   - 为什么会踩坑？
   - 如何避免？

3. 最佳实践
   - 发现了什么好的做法？
   - 为什么这样做更好？
   - 适用于什么场景？

4. 技术方案
   - 讨论了哪些技术选型？
   - 最终选择了什么？为什么？
   - 有什么 tradeoff？

【输出格式】
{
  "knowledge_items": [
    {
      "type": "lesson_learned | best_practice | technical_solution",
      "title": "简短标题（<15字）",
      "problem": "什么问题",
      "solution": "如何解决",
      "why": "为什么这样做",
      "when_to_use": "适用场景",
      "when_not_to_use": "不适用场景",
      "related_files": ["路径"],
      "participants": ["用户名"],
      "snippet_content": "完整的 Markdown snippet 内容（可直接推送）"
    }
  ],
  "session_summary": "3-5 句话总结这次对话的核心内容（用于每日总结）",
  "work_achievement": "如果完成了具体任务，描述成果（用于每日总结）"
}

【关键要求】
- 只提取**可复用**的知识（一次性任务不提取）
- snippet_content 必须自包含，包含背景、示例、适用条件
- session_summary 要具体，避免空泛（❌"讨论了配置" ✅"解决了 ECS 上 MCP 连接失败的问题，原因是 bind 配置错误"）
"""
```

### 2.3 知识去重

```python
def deduplicate_knowledge(new_item, existing_snippets):
    """
    避免重复推送相似知识
    """
    for existing in existing_snippets:
        similarity = calculate_similarity(
            new_item['snippet_content'],
            existing['content']
        )
        
        if similarity > 0.85:
            # 高度相似 → 判断是否需要更新
            if is_newer_better(new_item, existing):
                return {"action": "update", "target": existing}
            else:
                return {"action": "skip", "reason": "已存在"}
    
    return {"action": "create_new"}
```

### 2.4 自动推送 MCP

```python
for item in knowledge_items:
    dedup_result = deduplicate_knowledge(item, existing_snippets)
    
    if dedup_result['action'] == 'create_new':
        # 自动创建 snippet
        snippet_id = create_and_upload_snippet(
            name=generate_snippet_name(item['title']),
            knowledge_name=auto_match_knowledge(item['type']),
            content=item['snippet_content'],
            tags=[f"user:{item['participants'][0]}", "2026-02-24"]
        )
        
        log(f"✅ 新知识已推送: {item['title']} ({snippet_id})")
        
    elif dedup_result['action'] == 'update':
        # 创建新版本
        create_snippet_version(
            existing_id=dedup_result['target']['id'],
            new_content=item['snippet_content'],
            version_note=f"根据 {item['participants'][0]} 的实践更新"
        )
        
        log(f"✅ 知识已更新: {item['title']} (v2)")
```

---

## 每日总结生成

### 3.1 数据聚合

```python
daily_summary = {
    "date": "2026-02-24",
    "total_sessions": 50,
    "analyzed_sessions": 5,
    "knowledge_items_extracted": 3,
    
    "by_user": {
        "zhiyan": {
            "sessions": 2,
            "work_items": [
                "解决了 ECS 部署后 MCP 连接问题（bind 配置）",
                "设计了新的 API 认证流程"
            ],
            "knowledge_contributed": 1
        },
        "tony": {
            "sessions": 3,
            "work_items": [
                "完成 Feishu Knowledge 推送流程",
                "优化 Token 使用策略"
            ],
            "knowledge_contributed": 2
        }
    },
    
    "top_topics": [
        "ECS 部署与配置",
        "MCP Knowledge 管理",
        "Token 优化"
    ]
}
```

### 3.2 总结模板

**个人总结**（发给每位员工）:

```markdown
# {user} 的每日工作总结 ({date})

## 今日完成

{work_items}

## 今日贡献的知识

{knowledge_contributed}

## 明日计划

（可选，用户自己补充）

---
_本总结由 oxsciClaw 自动生成，基于你的 OpenClaw 和 Claude Code session_
```

**团队总结**（发到团队群）:

```markdown
# OxSci 每日知识沉淀 ({date})

## 📊 今日数据

- 总 session 数: {total_sessions}
- 深度分析: {analyzed_sessions}
- 新增知识: {knowledge_items_extracted}

## 🎯 今日亮点

{top_work_items}

## 💡 沉淀的知识

{knowledge_list}

## 🏆 贡献排行

{contribution_ranking}

---
_oxsciClaw 🐂_
```

---

## 实施时间表

### 每天下班前（18:00-19:00）

```python
# 自动触发或手动调用
/daily-digest

# 执行流程
1. Phase 1 过滤（5-10 分钟）
2. Phase 2 提炼（10-20 分钟，取决于高优 session 数量）
3. 生成总结（2-3 分钟）
4. 发送通知
```

### 用户交互

**Claude Code Session 提交**:
```
用户: @oxsciClaw 我今天的 Claude Code session 在这里
[附件: session_2026-02-24.jsonl]

oxsciClaw: 
✅ 收到！正在分析...
  - 检测到 1 个高价值对话（关于 Docker 部署优化）
  - 提取了 1 条血泪教训：bind mount 权限问题
  
📝 已添加到今日总结，晚些发给你
```

**主动提醒**:
```
oxsciClaw (18:00 自动):
@zhiyan 你今天有 2 个 session，我分析了其中 1 个（ECS 配置问题）。

如果你今天用了 Claude Code，可以把 session 文件发给我，我会一起分析。

位置通常在: ~/.claude/sessions/
```

---

## 配置文件

```yaml
# /opt/openclaw/workspace/skills/oxsci-knowledge/daily_digest_config.yaml

daily_digest:
  # 触发时间
  schedule: "18:00"
  
  # Phase 1 过滤
  filtering:
    scan_hours: 24  # 扫描过去 24 小时
    priority_threshold: 2.0  # 只深入分析 ≥2.0 的 session
    max_deep_analysis: 10  # 每天最多深入分析 10 个 session
  
  # Phase 2 提炼
  extraction:
    min_message_count: 3  # 至少 3 轮对话才值得提炼
    auto_push_threshold: 0.8  # 置信度 ≥0.8 自动推送，否则草稿
  
  # 总结生成
  summary:
    personal_summary: true  # 生成个人总结
    team_summary: true      # 生成团队总结
    send_to_feishu: true    # 发送到飞书
    send_to_email: false    # 发送到邮件（可选）
  
  # 通知
  notification:
    channel: "feishu"
    personal_chat: true     # DM 个人总结
    team_group: "oc_b72c6c8782386ea48a87d7d902108eb8"
```

---

## 质量保障

### 1. 人工审核（可选）

```python
if confidence < 0.8:
    # 生成草稿，发给用户确认
    send_draft_for_review(
        user=session_owner,
        draft=snippet_content,
        message="这条知识我不太确定是否值得沉淀，帮我看看？"
    )
```

### 2. 反馈机制

```markdown
【推送的知识】
标题: ECS bind 配置错误导致 MCP 连接失败

👍 有用  👎 无用  ✏️ 需要修改

（用户点击后，oxsciClaw 学习偏好）
```

### 3. 每周回顾

```python
# 每周五生成
weekly_digest = {
    "total_knowledge_items": 15,
    "high_usage_snippets": [
        "Docker 部署最佳实践",
        "Feishu API 权限配置"
    ],
    "low_usage_snippets": [
        "某个一次性 bug 的修复"  # 考虑归档
    ]
}
```

---

## 示例场景

### 场景 1: 配置错误排查

**Session**:
```
User: ECS 部署后 MCP 连接不上，怎么回事？
Agent: 检查配置...
User: config 里 bind 是 "loopback"
Agent: 问题找到了！改成 "lan"...
User: 好了！
```

**Phase 1 过滤**:
- 关键词: "连接不上"(3.0), "配置"(2.0)
- 分类: troubleshooting (3.0)
- 对话长度: 5 轮 (0.5)
- **总分: 8.5** → 高优先级

**Phase 2 提炼**:
```markdown
# ECS 部署后 MCP 连接失败：bind 配置问题

**问题**: ECS 部署后，Nginx 反向代理无法连接到 OpenClaw Gateway

**根因**: Gateway 配置中 `gateway.bind` 为 "loopback"（默认值），只监听 127.0.0.1

**解决方案**:
\`\`\`json
{
  "gateway": {
    "bind": "lan",  // 改为 lan，监听内网 IP
    "port": 18789
  }
}
\`\`\`

**适用场景**:
- OpenClaw 部署在 EC2/ECS，前面有 Nginx 反向代理
- 需要其他服务访问 Gateway

**血泪教训**:
- `config.apply` 会覆盖所有配置，必须先 `config.get` 合并
- 生产环境改配置前务必备份
```

**每日总结条目**:
```
zhiyan: 解决了 ECS 部署后 MCP 连接失败问题（bind 配置错误）
```

---

### 场景 2: 日常编码

**Session**:
```
User: 帮我写一个读取文件的函数
Agent: [生成代码]
User: 谢谢
```

**Phase 1 过滤**:
- 关键词: "帮我"(0.5), "函数"(0.5)
- 分类: routine_coding (0.5)
- 对话长度: 2 轮 (0.0)
- **总分: 1.5** → 跳过

**每日总结**: 不包含（常规操作）

---

## 成本估算

**假设每天 50 个 session**:

- Phase 1 过滤: 50 × 100 tokens = 5K tokens
- Phase 2 深度分析: 5 个高优 session × 3K tokens = 15K tokens
- 总结生成: 2K tokens
- **每日总计**: ~22K tokens ≈ $0.066 (Sonnet 4.5)

**月成本**: ~$2

**ROI**: 避免重复踩坑节省的时间 >> $2

---

## 总结

**核心优势**:

1. **高效**: Phase 1 过滤避免逐条读取，节省 90% token
2. **智能**: 基于关键词+分类+长度的多维度评分
3. **双产出**: 知识沉淀 + 每日总结，一鱼两吃
4. **可扩展**: 配置驱动，关键词/分类/阈值可调整
5. **质量保障**: 去重+置信度+人工审核

**明天上线后的第一周**:
- 观察过滤准确率，调整关键词和阈值
- 收集用户反馈，优化总结格式
- 识别高频知识类型，建立模板

**Let's make OxSci's knowledge compound! 🐂**

---

**设计者**: oxsciClaw  
**审核**: 待 Tony/shumiao 确认  
**状态**: 设计完成，待实施
