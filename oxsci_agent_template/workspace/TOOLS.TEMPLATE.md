# TOOLS.md - Environment Notes

_Skills are auto-discovered from `skills/` — no need to list them here. This file is for environment-specific notes._

## Creating Skills

Use the `skill-creator` skill (bundled with the framework). It generates correct SKILL.md with required YAML frontmatter.

```bash
# Create a new skill on EFS (where skills are deployed)
scripts/init_skill.py my-skill --path /opt/openclaw/workspace/skills/ --resources scripts

# Or for shared skills (loaded via extraDirs)
scripts/init_skill.py my-skill --path /opt/openclaw/skills/ --resources scripts
```

Then edit the generated SKILL.md — fill in the `description` and body content. Skip the packaging step (Step 5) — it's only needed for ClawHub distribution, not for direct deployment.

**Critical:** Every SKILL.md **must** have YAML frontmatter with `name` and `description`. Without it, the skill is silently ignored by the framework loader:

```yaml
---
name: my-skill
description: "What it does and when to use it."
---
```

## Feishu / Lark Suite

Bot config `domain: lark` — API calls go through `open.larksuite.com`. Both feishu.cn and larksuite.com (including jp.larksuite.com) links work. Token extraction is path-based, domain doesn't matter:

- `https://xxx.feishu.cn/wiki/ABC123` → token `ABC123`
- `https://jp.larksuite.com/wiki/ABC123` → token `ABC123` (same)

The built-in feishu-doc/feishu-wiki/feishu-drive skills show feishu.cn examples but work identically with Lark Suite URLs.

## AWS

- **Account:** `000373574646`
- **Region:** `ap-southeast-1` (Singapore)
- **Auth:** IAM role on EC2/ECS — use `aws` CLI directly, no explicit credentials needed
- **Infrastructure-as-code:** managed via `oxsci-deploy` repo (see `memory/REPOS.md`)

Service inventory and repo→infra mapping: see `memory/AWS.md`.

## Repos & Deployment

See `memory/REPOS.md` for code repositories and git access.
