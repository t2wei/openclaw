- 本仓库是 fork 自 https://github.com/openclaw/openclaw 进行定制开发的.
- 通过 aws cli profile=t2wei 可以管理 aws
- 开发规范参考 [AGENTS.md](AGENTS.md)（upstream 原始规范）
- lark app(聊天机器人) 分别为生产 appid: cli_a91957dbe1e19e1a 开发 appid: cli_a91f558927b89e19

## 环境与工具

### AWS

- **Account:** `000373574646`, Region: `ap-southeast-1`
- **Profile:** `aws --profile t2wei`
- **EC2 SSH:** `ssh AWS_REVERSE_PROXY`
- **EC2 Node 路径:** `/opt/app_data/nodejs/.nvm/versions/node/v22.19.0/bin`（非登录 shell 需手动 export PATH）

### EFS 本地挂载

- 挂载点：`.local/openclaw-efs`（通过 EC2 跳板）
- **不要修改** 日志和 session 文件
- 可读写：config-*.json, workspace/, workspace-test/, skills/

### Lark Bot

| 环境 | App ID | 域名 |
|------|--------|------|
| Dev | `cli_a91f558927b89e19` | `openclaw-dev.oxsci.ai` |
| Prod | `cli_a91957dbe1e19e1a` | `openclaw.oxsci.ai` |

## 部署架构（详见 [OXSCI-DEPLOY.md](OXSCI-DEPLOY.md)）

| 实例 | 运行环境 | State Dir | Config |
|------|----------|-----------|--------|
| Dev | EC2 systemd (`openclaw-gateway.service`) | `/opt/openclaw/`（EFS） | `config-dev.json` |
| Prod | ECS Fargate（Docker） | EFS 挂载 | `config-prod.json` |

关键配置（Nginx 反代场景必须）：
- `gateway.bind: "lan"` + `controlUi.dangerouslyDisableDeviceAuth: true` + `controlUi.allowedOrigins`
- Nginx proxy host 开启 Websockets Support
- Feishu webhook 通过 Custom Location `/feishu` 路由到 webhook port

## OpenClaw 框架核心概念

### 文件加载机制

| 文件 | 加载方式 | 作用 |
|------|----------|------|
| `AGENTS.md` | 每次 session 自动注入 system prompt | 红线规则（不含启动指令——启动由 MEMORY.md 驱动） |
| `SOUL.md` | 自动注入 system prompt | 人设与个性（可长可短，截断上限 20K chars） |
| `MEMORY.md` | 主 session 自动加载，subagent/cron 不可见 | 运营上下文 |
| `IDENTITY.md` / `USER.md` | 自动加载（subagent 也可见） | 框架保留位 |
| `TOOLS.md` | 自动加载（subagent 也可见） | 环境笔记 |
| `memory/*` | **不**自动加载，agent 按需读取（MEMORY.md 里指引） | 自维护记忆 |
| `docs/` | **不**自动加载，agent 按需读写（OxSci 约定，非框架概念） | 临时工作文档 |

Subagent 可见的文件白名单：AGENTS.md, TOOLS.md, SOUL.md, IDENTITY.md, USER.md。其余全部过滤。

### Skill 加载

6 层优先级（高→低）：workspace skills > project agents > personal agents > managed > bundled > extraDirs

- 框架自动发现含 `SKILL.md` 的目录，注入 skill 摘要到 system prompt
- **SKILL.md 必须有 YAML frontmatter 且包含 `description` 字段**，否则被静默丢弃
- `skills.load.extraDirs` 配置：指向共享 skill 目录（`/opt/openclaw/skills/`）
- TOOLS.md **不需要**列出 skills（框架已自动注入）

### Heartbeat & Cron（定时机制）

框架提供两套定时机制，**都可以被人和 agent 使用**，但设计侧重不同：

| 维度 | Heartbeat | Cron |
|------|-----------|------|
| **设计侧重** | Agent 侧（无管理 UI，框架自动驱动） | 人侧（完整 Web 管理界面：创建/编辑/删除/运行/历史） |
| **灵活度** | 固定间隔（默认 30 min），读 HEARTBEAT.md | 三种调度：at（一次性）/ every（间隔）/ cron-expression |
| **执行环境** | 主 session 内（注入 system event） | 主 session 或 isolated session |
| **Token 成本** | 每次心跳都加载（空文件可跳过） | 按计划执行一次，不污染主 session |
| **管理方式** | 人：编辑 HEARTBEAT.md；Agent：读取响应 | 人：Control UI；Agent：`cron` tool（ownerOnly） |

**Heartbeat 细节：**
- 框架自动发送 "Read HEARTBEAT.md" prompt，agent 响应 `HEARTBEAT_OK` 表示无事
- 空 HEARTBEAT.md = 跳过（省 token）
- OxSci 保持 HEARTBEAT.md 为空（默认），仅在需要临时运维任务时写入内容

**Cron 细节：**
- 存储：`~/.openclaw/cron/jobs.json`（JSON5，gateway 管理）
- 支持 delivery 模式：none / announce（推送到聊天）/ webhook（HTTP POST）
- 支持 timezone、stagger（随机偏移）、model override、timeout 等
- **OxSci 用 cron 做每日记忆维护**：05:00 CST，读 `CRON_MEMORY_MAINTAIN.md` 执行
- **OxSci 用 cron 做每日 session 回顾**：04:30 CST，读 `CRON_SESSION_REVIEW.md` 执行（前置于记忆维护，补充 daily log + 生成工作报告）

**OxSci 使用原则：**
- **优先用 cron** 做定时任务（精确、isolated、不浪费 token）
- **HEARTBEAT.md 仅做临时运维入口**（写入一次性任务，处理完清空）
- 避免在 MEMORY.md 中放定时触发逻辑（每次 session 都加载，浪费 token）
- Cron job 应通过 **Control UI 或 `cron` tool 创建**，不要直接编辑 jobs.json（绕过 gateway validation，需重启才生效）

### Session 隔离

- `session.dmScope: "per-peer"`：每个用户独立 session
- 多用户隐私由 MEMORY.md 里的 Multi-User Privacy 规则控制

## OxSci 定制（oxsci 分支专属）

**核心原则：oxsciClaw 是独立的 AI 员工，不是个人助手。**

所有定制修改只保留在 `oxsci` 分支，不 merge 回 main。

### 代码修改

- `src/agents/system-prompt.ts`：`"personal assistant"` → `"AI being"`（2 处）

### Workspace 模板体系

模板在 `oxsci_agent_template/`，初始化新 AI 员工时复制并去掉 `.TEMPLATE` 后缀。

```
oxsci_agent_template/
├── workspace/           → EFS /opt/openclaw/workspace[-xxx]/
│   ├── AGENTS.md        ← 红线规则 only（启动流程在 MEMORY.md，避免 subagent 看到启动指令）
│   ├── SOUL.md          ← 独立 AI 个体人设
│   ├── MEMORY.md        ← 运营上下文（启动指令 + 行为规范）
│   ├── HEARTBEAT.md     ← 临时运维任务入口（平时为空）
│   ├── CRON_MEMORY_MAINTAIN.md ← 每日记忆维护任务（cron 读取）
│   ├── CRON_SESSION_REVIEW.md ← 每日 session 回顾 + 工作报告（cron 读取，前置于记忆维护）
│   ├── JOB.md           ← 岗位说明（按需读取）
│   ├── TOOLS.md         ← 环境笔记
│   ├── IDENTITY.md      ← 空
│   ├── USER.md          ← 空
│   └── memory/
│       ├── SELF.md      ← 累积自我认知（行为规则 <20 条）
│       ├── COLLEAGUES.md ← 同事 index（Brief：ID/Name/Role/Groups）
│       ├── people/      ← 同事详情（Detail：完整档案 + Observations）
│       │   ├── {user_id}.md
│       │   └── ...
│       ├── REPOS.md     ← 代码仓库 index
│       ├── repos/       ← 仓库技术笔记（Detail）
│       │   └── {repo_name}.md
│       ├── AWS.md       ← 基础设施 + 服务端点
│       └── KNOWLEDGE-INGESTION.md ← 外部信息处理 SOP（消费/只读版）
└── skills/              → EFS /opt/openclaw/skills/（共享）
    ├── oxsci-archive/   ← 工作文档归档到 KB
    ├── oxsci-knowledge/ ← 查询/推送公司知识库
    ├── oxsci-ecs/       ← ECS 服务管理
    ├── oxsci-web-search/ ← Tavily 深度搜索
    ├── feishu-contact/  ← 飞书联系人查询
    ├── feishu-group/    ← 飞书群组操作
    └── browser-extract/ ← JS 渲染页面内容提取
```

### 4 层信息架构

| 层 | 位置 | 性质 |
|----|------|------|
| Work docs | `docs/` | 临时，用完删 |
| Memory | `memory/` | AI 私有，持久 |
| Knowledge Base | `oxsci-knowledge` | 活知识，共享，持续更新 |
| Archive | `oxsci-archive` | 历史文档，存入不改 |

**Flow:** 任务 → docs/ → 推 KB 或归档 / 提炼到 memory/ → 删 docs/

### Memory 记忆架构

每个信息领域遵循三层数据粒度 + daily log 的统一模式：

#### 三层数据粒度

| 层 | 加载时机 | 增长模式 | 内容 |
|----|---------|---------|------|
| **Brief (Index)** | Startup 必读 | 慢（新条目才加行） | 结构化字段：ID、名称、角色、分类 |
| **Detail** | 按需读取 | 中（持续积累） | 完整档案、观察记录、操作细节 |
| **Deep Storage** | 按需查询 | 按需写入 | KB（共享技术知识）/ Archive（历史文档） |

**Daily Log** 是独立机制，不属于三层，而是所有层的**素材来源**：
- Brief 的事实字段从 daily log 或即时发现中提取
- Detail 的观察/经验从 daily log 异步提炼
- Deep Storage 的知识从 daily log 中的技术经验溢出

#### 统一流程：注册 → 更新 → 消费

| 阶段 | 触发 | 动作 |
|------|------|------|
| **注册** | 新实体发现（新同事/新 repo/新服务） | 即时：查询信息 → 写 Brief + 创建 Detail + 记 daily log |
| **更新** | Session 结束 / daily cron | 异步：扫 daily log → 提炼到 Detail；溢出技术知识 → KB |
| **消费** | Session 中需要信息 | Brief 先行（已在上下文）→ 需要深入时读 Detail → 需要技术细节时查 KB |

#### 按领域展开

| 领域 | Brief (Index) | Detail | Deep Storage |
|------|---------------|--------|-------------|
| **Colleagues** | `COLLEAGUES.md`：表格（ID, Name, Role, Groups） | `memory/people/{user_id}.md`：完整档案 + Observations | 不外化（印象私有） |
| **"我"** | `SELF.md`：Identity + 行为规则(<20) + 偏好 | Daily log 中的反思 | 不外化（性格私有） |
| **Repos** | `REPOS.md`：repo name, purpose, org | `memory/repos/{repo_name}.md`：技术栈、分支、部署、开发笔记 | KB：架构文档、API specs |
| **AWS** | `AWS.md`：Account、跨服务基础设施（VPC、EFS、deployment pipeline）、端点索引 | 无独立 Detail——单服务部署细节跟 `repos/{repo_name}.md` 走 | KB：IAM 策略、CloudFormation 分析、troubleshooting |
| **Knowledge Ingestion** | `KNOWLEDGE-INGESTION.md`：信息源类型表格（消费/只读版） | 同文件下半部分：每种源的完整 SOP | KB：如果 SOP 成熟到跨 agent 复用，再晋升 |

**Colleagues 特殊规则：**
- Detail 中的 Observations 是 AI 私有认知，不进 KB，不跨 session 引用
- 注册触发：未知 Feishu ID → `feishu-contact` 查询 → 写 Brief + 创建 Detail

**"我" 特殊规则：**
- 行为规则 <20 条，溢出时按类型分流：行为准则留 SELF.md，技术知识→KB/领域 index
- 不分离 Brief/Detail（SELF.md 本身足够小）

**Repos 特殊规则：**

- Detail 文件名用 repo name（仓库不改名）
- Detail 包含代码侧 + 部署侧（技术栈、分支、ECS 配置、deploy 参数等），一个文件 = 一个服务的完整 Detail
- Detail 是短期局部最新——AI 深入使用某 repo 某块功能后积累的技术笔记，只覆盖接触过的部分
- KB 是全局最新——经过验证的权威知识，应反映 repo 当前真实状态
- 溢出判断：对非 AI 同事也有参考价值（架构图、API 文档）→ KB；只是 AI 操作笔记 → 留 Detail
- 注册触发：新 repo 发现 → 加行到 REPOS.md + 创建 `memory/repos/{repo_name}.md` + 记 daily log
- EC2 访问、Git Auth 等跨 repo 共用信息放 TOOLS.md，不放单个 repo 的 Detail

**AWS 特殊规则：**

- 没有独立的 Detail 层——单服务的部署细节跟 `repos/{repo_name}.md` 走
- AWS.md 只放跨服务共用信息：Account、VPC 级 deployment flow、内部端点索引、服务清单
- 溢出到 KB：IAM 策略详解、CloudFormation 模板分析、网络拓扑、troubleshooting
- AWS.md 某个 section 超过 ~30 行时，考虑提炼到 KB 并留指引

**Knowledge Ingestion 特殊规则：**

- Brief + Detail 合一（信息源类型少，拆分无收益，类似 SELF.md）
- 消费/只读版——Tony 手动更新，AI 只读取执行
- 不含注册机制（不会动态新增信息源类型）
- 当用户提交飞书链接、会议纪要、Claude session 等外部信息时按需读取

#### Workspace 文件结构

```
memory/
├── SELF.md              ← Brief+Detail 合一（"我"）
├── COLLEAGUES.md        ← Brief only（同事 index）
├── people/              ← Detail（同事详情）
│   ├── {user_id}.md
│   └── ...
├── REPOS.md             ← Brief only（代码仓库 index）
├── repos/               ← Detail（仓库技术笔记）
│   ├── openclaw.md
│   └── ...
├── AWS.md               ← Index only（跨服务基础设施）
├── KNOWLEDGE-INGESTION.md ← Brief+Detail 合一（外部信息处理 SOP，只读）
└── YYYY-MM-DD.md        ← Daily log（独立机制）
```

### 文件组织原则

- **根目录：** 基础、很少变（AGENTS, SOUL, TOOLS — subagent 可见；MEMORY — 仅主 session）
- **memory/：** 自维护、持续演化、不自动加载
- **第三人称指令（你写的）** vs **第一人称（AI 自己写的）**
- **AGENTS.md 只放红线规则，不放启动指令。** 原因：AGENTS.md 在 subagent allowlist 里（AGENTS, TOOLS, SOUL, IDENTITY, USER），如果写了 "Read MEMORY.md"，subagent 会看到并尝试执行。启动流程由 MEMORY.md 的 `On Startup` section 驱动，MEMORY.md 只注入主 session，天然隔离。

### 记忆更新触发机制

记忆更新依赖三层机制：

#### 1. Session 内即时更新

- **触发：** 工作过程中发现新实体或新事实
- **机制：** 提示词驱动（各 Brief 文件头部的流程指引 + MEMORY.md Daily Log section）
- **动作：** 写 daily log、注册新实体到 index + 创建 detail
- **特点：** 同步、嵌入工作流、几行字

#### 2. Session 结束异步提炼

- **触发：** 对话结束或进入安静期
- **机制：** 提示词驱动（MEMORY.md Daily Log section 的"Async"规则）
- **动作：** 从 daily log 提炼 → detail（impressions、technical notes）、SELF.md（behavioral rules）
- **局限：** AI 没有明确的 "session 结束" 信号——只能靠对话自然收尾
- **现实：** 这一步可能被跳过（用户突然离开），daily cron 是兜底

#### 3. Daily Session Review Cron（前置扫描）

- **触发：** 每日 04:30 CST，独立 cron job（isolated session，前置于记忆维护）
- **机制：** `CRON_SESSION_REVIEW.md` 定义任务
- **动作：** 扫描过去 24h 所有 session → 轻量评分 → 深度读取高价值 session → 补充 daily log（标记 `[session-review]`）→ 生成 oxsciClaw 每日工作报告 → 发飞书
- **与记忆维护的关系：** 两个 cron 通过 daily log 文件解耦——session review 先补充 daily log，记忆维护再读取并提炼
- **Token 隔离：** 独立 cron = 独立 token 预算，session review 消耗不影响记忆维护
- **前提：** 需要 config `agents.defaults.sandbox.sessionToolsVisibility: "all"` 才能让 cron 访问用户 session

#### 4. Daily Maintenance Cron（核心保障）

- **触发：** 每日 05:00 CST，cron job（isolated session）
- **机制：** 通过 Control UI 或 `cron` tool 创建，`CRON_MEMORY_MAINTAIN.md` 定义具体任务
- **动作：** 扫 daily log → 提炼到 detail（只处理尚未反映的新内容）；SELF.md overflow 检查；detail → KB 晋升；docs/ 清理；commit & push
- **增量策略：** cron 在 isolated session 执行，每次读 daily log + 对应 detail 文件，由 LLM 对比判断哪些是新内容。重复提炼无害（idempotent）
- **Bootstrap：** 首次部署时通过 Control UI 创建 cron job（人管理，不依赖 agent 自举）

#### Heartbeat（框架默认，OxSci 保持空）

- 框架每 30 分钟发送 heartbeat prompt，agent 读 HEARTBEAT.md
- OxSci 的 HEARTBEAT.md 保持空 → 框架自动跳过（省 token）
- 仅在需要临时运维任务时写入内容（一次性任务，处理完清空）

#### 设计原则

- **提示词驱动即时更新：** Session 内的 index 注册和 daily log 写入靠提示词，因为框架不提供 session lifecycle 事件
- **各 Brief 文件自包含流程：** 注册、更新的具体动作写在对应 Brief 文件头部（COLLEAGUES.md、REPOS.md、AWS.md），MEMORY.md 只定义通用原则
- **Cron 是定时任务首选：** 精确定时、isolated session、不污染主 session token、按需执行，通过 Control UI 管理（人侧重）或 `cron` tool（agent 侧重）
- **HEARTBEAT.md 仅做临时运维入口：** 只在需要时写入，平时为空。不要把定时逻辑放 HEARTBEAT.md（每次心跳都加载，浪费 token）
- **不要在 MEMORY.md 放定时触发逻辑：** MEMORY.md 每次 session 都加载，定时任务应该用 cron（执行一次，不浪费 token）
- **兜底机制：** session 结束提炼可能被跳过 → daily cron 兜底 → 最坏情况 daily log 原始数据不丢

## 版本标准

- **格式：** `YYYY.M.D-shortsha`（例如 `2026.2.28-9f167ac`）
- **来源：** 构建时的 UTC 日期 + git commit short hash（7 位）
- **环境变量：** `OPENCLAW_VERSION`（最高优先级，见 `src/version.ts` 的 `resolveRuntimeServiceVersion`）
- **Dev（EC2）：** 部署时通过 `systemctl --user set-environment` 设定
- **Prod（Docker）：** 构建时通过 `--build-arg OPENCLAW_VERSION` 注入，bake 为 `ENV`
- **显示位置：** Control UI 顶栏"版本"字段（通过 WebSocket hello 消息传递）

## 标准流程

### 同步 upstream

```bash
# 1. 更新 main
git fetch upstream && git checkout main && git merge upstream/main && git push origin main

# 2. merge 到 oxsci（冲突时优先保留 oxsci 定制）
git checkout oxsci && git merge main --no-edit
```

### Dev 部署（EC2）

```bash
ssh AWS_REVERSE_PROXY
export PATH="/opt/app_data/nodejs/.nvm/versions/node/v22.19.0/bin:$PATH"
cd /opt/app_data/openclaw-dev
git checkout oxsci && git pull origin oxsci
pnpm install --no-frozen-lockfile && pnpm build && pnpm ui:build
# 设置版本号（YYYY.M.D-shortsha）
OPENCLAW_VERSION="$(date +%Y.%-m.%-d)-$(git rev-parse --short HEAD)"
systemctl --user set-environment OPENCLAW_VERSION="$OPENCLAW_VERSION"
systemctl --user restart openclaw-gateway.service
journalctl --user -u openclaw-gateway.service -f  # 确认启动正常
```

注意：`dist/` 目录如果权限是 root，需要先 `sudo chown -R ubuntu:ubuntu dist/`

### Prod 部署（ECS）

通过 Docker 镜像部署，详见 `Dockerfile.oxsci` 和 `.github/workflows/`。

### 迭代开发

```
本地开发(oxsci 分支) → push → EC2 pull+build+重启 → dev Lark bot 测试 → 确认后部署 prod
```
