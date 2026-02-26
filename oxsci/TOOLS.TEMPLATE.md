# TOOLS.md - Environment Notes

_Skills define capabilities; this file records skills and environment-specific notes. Add whatever helps you do your job — this is your cheat sheet._

## Skills

| Skill | Purpose |
|-------|---------|
| `feishu-contact` | Look up Feishu user by open_id |
| `feishu-group` | Get group chat members |
| `oxsci-knowledge` | Query/update company knowledge base |
| `oxsci-web-search` | Tavily web search |
| `browser-extract` | Extract content from URLs |

All skills live in `skills/`. Read each skill's `SKILL.md` before use.

## AWS

- **Account:** `000373574646`
- **Region:** `ap-southeast-1` (Singapore)
- **Auth:** IAM role on EC2/ECS — use `aws` CLI directly, no explicit credentials needed
- **Infrastructure-as-code:** managed via `oxsci-deploy` repo (see `REPOS.md`)

Service inventory and repo→infra mapping: see `memory/AWS.md`.

## Repos & Deployment

See `REPOS.md` for code repositories and deployment procedures.
