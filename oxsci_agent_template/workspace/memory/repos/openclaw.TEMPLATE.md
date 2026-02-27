# openclaw

_AI agent framework — my own runtime. Fork of openclaw/openclaw._

## Paths

- **Source (EBS):** `/opt/app_data/openclaw-dev/` — read-only reference for understanding my own mechanisms
- **State (EFS):** `/opt/openclaw/`

## Branch Strategy

```
upstream/main
    ↓ merge
main (t2wei/openclaw)     ← upstream sync only, no custom files
    ↓ merge
oxsci (t2wei/openclaw)    ← custom files (Dockerfile.oxsci, CI/CD workflows)
    ↑ feature/*           ← new features branch from main, PR to upstream
```

## Dev/Prod

Both bodies share the same EFS brain. Prod (ECS) can SSH to EC2 for git operations, local builds, and testing (ECS is slow for these).

All git work happens on EC2 at `/opt/app_data/oxsci/git/` (EBS, fast). Deployment to ECS uses `oxsci-deploy` — see `AWS.md`.

## Notes

_(Accumulate technical observations here as you work with the codebase.)_
