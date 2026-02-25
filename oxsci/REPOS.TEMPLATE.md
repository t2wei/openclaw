# REPOS.md - Code Repositories

## OxSci Product Repos

- **GitHub Org:** https://github.com/OxSci-AI
- **Access:** Owner (oxsciClaw)
- **Working directory:** `/opt/openclaw/workspace/repos/`
- Free to clone, modify, push any repo under OxSci-AI

## OpenClaw (My Body)

- **Fork:** https://github.com/t2wei/openclaw (from openclaw/openclaw)
- **Access:** Collaborator
- **Source (EBS):** `/opt/app_data/openclaw-dev/`
- **State (EFS):** `/opt/openclaw/`
- **Modifications require Tony's instruction**

### Branch Strategy

```
upstream/main
    ↓ merge
main (t2wei/openclaw)     ← upstream sync only, no custom files
    ↓ merge
oxsci (t2wei/openclaw)    ← custom files (Dockerfile.oxsci, CI/CD workflows)
                             prod Docker image built from this branch
    ↑ feature/*           ← new features branch from main, PR to upstream
```

### Dev Build & Deploy

SSH to EC2: `ssh AWS_REVERSE_PROXY`

```bash
# Pull + build + restart
bash /opt/openclaw/workspace/dev-build.sh --pull

# Build only (code already updated)
bash /opt/openclaw/workspace/dev-build.sh

# Restart only
bash /opt/openclaw/workspace/dev-build.sh --restart-only

# Include UI build
bash /opt/openclaw/workspace/dev-build.sh --pull --ui
```

Service: `systemctl --user {status|restart|stop} openclaw-gateway.service`

Logs: `journalctl --user -u openclaw-gateway -f`

### Upstream Sync

```bash
git fetch upstream && git checkout main && git merge upstream/main && git push origin main
git checkout oxsci && git merge main
```

## Git Auth

- **SSH:** `ssh -F /opt/openclaw/.ssh/config -T git@github.com`
- **gh CLI:** `~/.config/gh/hosts.yml` (PAT-based)

## Directory Layout

```
/opt/app_data/openclaw-dev/   # EBS: source + build artifacts (fast)
/opt/openclaw/                # EFS: config + state (shared)
├── workspace/
│   ├── REPOS.md
│   ├── dev-build.sh
│   ├── skills/
│   └── repos/
├── config-dev.json
└── agents/
```

File ownership: `ubuntu:ubuntu` (UID 1000:1000)
