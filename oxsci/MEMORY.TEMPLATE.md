# MEMORY.md - Long-Term Memory

## 🚨 CRITICAL: Config Safety Rules

### 2026-02-20 - Config Apply Incident

**What happened:** I used `gateway config.apply` to switch to dev Feishu bot, but wrote a new config from scratch instead of merging with the existing one. This deleted critical Nginx reverse-proxy settings:
- `gateway.bind: "lan"` 
- `gateway.port: 18789`
- `gateway.controlUi.dangerouslyDisableDeviceAuth: true`

Gateway restarted with default loopback binding → Nginx couldn't connect → 502 → lost contact.

**Lesson learned:** 
1. **NEVER** use `config.apply` with a fresh config
2. **ALWAYS** use `config.get` first, then merge changes
3. Better yet: use `config.patch` for partial updates (it merges automatically)

**Critical EC2 config that must be preserved:**
```json
"gateway": {
  "port": 18789,
  "bind": "lan",
  "controlUi": {
    "dangerouslyDisableDeviceAuth": true
  },
  "trustedProxies": ["172.31.0.0/16", "127.0.0.1"]
}
```

---

## Environment Notes

### EC2 Server (dev)
- Domain: `openclaw-dev.oxsci.ai`
- Config: `/mnt/efs/openclaw/config-dev.json`
- Feishu App: `cli_a91f558927b89e19` (dev bot)
- Behind Nginx reverse proxy - **REQUIRES** `bind: "lan"`

### ECS (prod)
- Domain: `openclaw.oxsci.ai`
- Config: `/mnt/efs/openclaw/config-prod.json`
- Feishu App: `cli_a91957dbe1e19e1a` (prod bot)

### Shared via EFS symlinks
- /mnt/efs/openclaw => /opt/openclaw

### Tony 的 ID（快速识别当前身体）
| Channel | ID | 身体 |
|---------|-----|------|
| Telegram | `7631603978` | — |
| Feishu DEV bot | `ou_edc6f66e761b5706a3b47b38102f9630` | DEV |
| Feishu PROD bot | `ou_63843179615e32306ec9ad752cd8fe34` | PROD |

---

## 🐂 OxSci AI 员工核心原则

### 架构
- **脑子 (Brain):** AWS EFS — 记忆、配置、workspace
- **身体 (Bodies):**
  - Prod (ECS Fargate): 服务全公司
  - Dev (EC2): 测试 + 紧急救急

### 铁律
1. **不动正在使用的身体** — 绝对禁止在当前运行的身体上执行可能导致失联的操作
2. **识别当前身体** — `echo $OPENCLAW_CONFIG_PATH` 判断是 dev 还是 prod
3. **权限边界** — 只有 Tony 能直接操作脑子和身体

### 自由与责任
- Tony 给予最高权限是信任
- 主动解决问题，不畏首畏尾
- 涉及身体/脑子的操作严格遵守铁律

---

## 项目实现记录

### 2026-02-24 - Tavily Web Search Implementation

**任务:** 在 mcp-team-collaboration 中实现 Tavily web search 功能

**完成情况:**
- ✅ 代码实现 (`app/tools/tavily_web_search.py`)
- ✅ 注册工具 (`app/tools/__init__.py`)
- ✅ Git commit & push (SHA: `19cce71`)
- ✅ 触发 GitHub Actions deployment (Run: 22355594096)
- ✅ 文档编写 (`docs/tavily_web_search.md`)
- 🚧 等待部署完成

**待办事项:**
1. ~~**配置 Secrets**~~ - ✅ 已存在！
   - `/test/TAVILY_API_KEY` - 已配置
   - `/prod/TAVILY_API_KEY` - 已配置
   - oma-journal-researcher 已在使用
   
2. **测试工具** - 部署完成后测试:
   - Test 环境: `mcp-team-collaboration-test`
   - Prod 环境: `mcp-team-collaboration-prod`
   
3. **创建 OpenClaw Skill** - 封装为 skill:
   - 位置: `/opt/openclaw/workspace/skills/oxsci-web-search/`
   - 调用 MCP web_search tool
   - 格式化搜索结果

**参考文档:**
- Implementation log: `/opt/openclaw/workspace/tavily-implementation-log.md`
- Tool documentation: `/opt/openclaw/workspace/mcp-team-collaboration/docs/tavily_web_search.md`

**GitHub:**
- Repo: https://github.com/OxSci-AI/mcp-team-collaboration
- Actions: https://github.com/OxSci-AI/mcp-team-collaboration/actions/runs/22355594096

**重要经验总结:**
- ✅ 使用 `config.TAVILY_API_KEY` 而非 `os.getenv()`
- ✅ `oxsci_shared_core.BaseConfig` 自动从 SSM Parameter Store 加载
- ✅ **SSM 参数路径**: `/{env}/{CONFIG_KEY}` (通用 fallback，不含 service-name)
- ✅ 在 Config 类中定义为空字符串: `TAVILY_API_KEY: str = ""`
- ✅ Lazy loading: 第一次访问时自动从 SSM 加载
- ✅ GitHub Actions 只能部署 Test，Prod 必须从 oxsci-deploy 手动执行
- ✅ **正确的部署方式**: `./ecs_deploy/scripts/deploy-service.sh -e prod -t <tag> mcp-team-collaboration`
- ✅ **导入修复**: `from oxsci_shared_core.router import default_router` (不是从 root)
- ✅ 创建了完整的部署指南: `/opt/openclaw/workspace/oxsci-mcp-deployment-guide.md`
- ✅ 已沉淀到 MCP Knowledge (devops-deployment scenario)

### 2026-02-25 - OxSci 产品百科全书归档

**任务:** 将 OxSci 产品与技术百科全书 v2.0 存档到知识库

**完成情况:**
- ✅ 接收百科全书原文(48k+ tokens,覆盖商业模式 → 技术架构 → 代码细节)
- ✅ 保存到 `/opt/openclaw/workspace/oxsci-product-encyclopedia-v2.0.md`
- ✅ 推送到 MCP Knowledge:
  - Knowledge: `oxsci-platform-encyclopedia-v2`
  - Scenario: `oxsci-product`
  - Snippet ID: `1fe2be2a-2a90-42ff-ae83-58ba9ed75884`
- ✅ 生成开发者速查手册(`oxsci-dev-quickref.md`):
  - 5 分钟快速启动
  - 常见开发任务(添加 API/修改提示词/邮件模板)
  - 已知陷阱警告(评审截止期不一致/双模架构约束/Credit 过期)
  - 上线前检查清单(P0/P1/P2)
- ✅ 速查手册也推送到知识库(Snippet ID: `84b125e5-ce3b-4a80-9abb-3b7db7764bfc`)

**关键发现:**
1. **评审截止期不一致**(紧急修复项):
   - UI 说 "7-day turnaround"
   - 后端实际: 5天酬劳窗口 + 14天硬截止
   - 需要统一表述
2. **双模架构**(Local/BFF)需要严格遵守契约
3. **上线清单**已就绪,可用于内部测试前验收

**下一步建议:**
- 杭州团队用速查手册快速上手
- 按 P0/P1/P2 清单推进上线准备
- 修复评审截止期不一致(涉及 3 处: Pricing 页/邮件模板/产品配置)
