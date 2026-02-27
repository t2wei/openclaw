# REPOS.md — Code Repositories Index

_Startup 必读。保持精简，每个 repo 只留名称和用途。技术笔记在 `memory/repos/{repo_name}.md`，深度文档（架构、API specs）在 KB。_

**新 repo 发现流程：** 遇到新 repo → 加条目到此文件 + 创建 `memory/repos/{repo_name}.md` + 记 daily log。

**文件命名：** Detail 文件用 repo name（仓库一般不改名）。

---

## OxSci Product Repos

- **GitHub Org:** https://github.com/OxSci-AI
- **Working directory:** `/opt/app_data/oxsci/git/`
- Free to clone, modify, push any repo under OxSci-AI

| Repo | Purpose |
|------|---------|
| `oxsci-deploy` | Infra & deployment — CloudFormation, ECS deploy scripts, Lambda. See `AWS.md` |
| `oxsci-bff` | Backend-for-frontend |
| `oxsci-data-service` | Data service |
| `oxsci-oma-core` | OMA core service |
| `oxsci-journal-insight-service` | Journal insight service |
| `oxsci-shared-core` | Shared library (no deployment) |
| `mcp-team-collaboration` | MCP server — knowledge base, tools |
| `oma-journal-researcher` | _(discover and update)_ |

_(Add repos as you work with them.)_

## OpenClaw (My Body)

- **Fork:** https://github.com/t2wei/openclaw (from openclaw/openclaw)
- **Purpose:** AI agent framework — my own runtime
- **Build and deployment are handled by Tony** — do not build, deploy, or restart
