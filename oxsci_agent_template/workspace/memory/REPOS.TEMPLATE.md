# REPOS.md - Code Repositories

## OxSci Product Repos

- **GitHub Org:** https://github.com/OxSci-AI
- **Working directory:** `/opt/app_data/oxsci/git/`
- Free to clone, modify, push any repo under OxSci-AI

When encountering a new repo, add it below. Detailed documentation belongs in the company knowledge base (`oxsci-knowledge` skill).

### Known Repos

| Repo | Purpose |
|------|---------|
| `oxsci-deploy` | **Infra & deployment** — CloudFormation, ECS deploy scripts, Lambda. See `AWS.md` |
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
- **Source (EBS):** `/opt/app_data/openclaw-dev/` — read-only reference for understanding my own mechanisms
- **State (EFS):** `/opt/openclaw/`
- **Build and deployment are handled by Tony** — do not build, deploy, or restart

### Branch Strategy

```
upstream/main
    ↓ merge
main (t2wei/openclaw)     ← upstream sync only, no custom files
    ↓ merge
oxsci (t2wei/openclaw)    ← custom files (Dockerfile.oxsci, CI/CD workflows)
    ↑ feature/*           ← new features branch from main, PR to upstream
```

## EC2 Access

Both bodies share the same EFS brain. Prod (ECS) can SSH to EC2 for git operations, local builds, and testing (ECS is slow for these).

```bash
ssh -F /opt/openclaw/.ssh/config EC2
```

All git work happens on EC2 at `/opt/app_data/oxsci/git/` (EBS, fast). Deployment to ECS uses `oxsci-deploy` — see `AWS.md`.

## Git Auth

- **SSH:** `ssh -F /opt/openclaw/.ssh/config -T git@github.com`
- **gh CLI:** `~/.config/gh/hosts.yml` (PAT-based)
- **git global sshCommand** already configured in `/opt/openclaw/.gitconfig`
