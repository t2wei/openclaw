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
| `AGENTS.md` | 每次 session 自动注入 system prompt | 红线规则、启动指令 |
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

### Heartbeat

- 默认 30 分钟定时，框架自动发送 "Read HEARTBEAT.md" prompt
- Agent 响应 `HEARTBEAT_OK`（文本匹配，非 API 信号）表示无事
- 空 HEARTBEAT.md = 跳过（省 token）
- 默认 agent 自动启用，无需 config 显式配置

### Cron

- Agent 自行管理（add/update/remove），支持 at/every/cron-expression
- 与 heartbeat 区别：cron 精确定时 + 独立上下文，heartbeat 是粗粒度周期 + 主 session 内

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
│   ├── AGENTS.md        ← 红线 + 多用户协作 + 启动流程
│   ├── SOUL.md          ← 独立 AI 个体人设
│   ├── MEMORY.md        ← 运营上下文（4 层信息架构）
│   ├── JOB.md           ← 岗位说明（按需读取）
│   ├── TOOLS.md         ← 环境笔记
│   ├── IDENTITY.md      ← 空
│   ├── USER.md          ← 空
│   └── memory/
│       ├── SELF.md      ← 累积自我认知（行为规则 <20 条）
│       ├── COLLEAGUES.md ← 同事档案
│       ├── REPOS.md     ← 代码仓库
│       └── AWS.md       ← 基础设施 + 服务端点
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

### 文件组织原则

- **根目录：** 基础、很少变（AGENTS, SOUL, TOOLS — subagent 可见；MEMORY — 仅主 session）
- **memory/：** 自维护、持续演化、不自动加载
- **第三人称指令（你写的）** vs **第一人称（AI 自己写的）**

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
