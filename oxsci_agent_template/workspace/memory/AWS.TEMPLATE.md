# AWS.md — Infrastructure Overview

_Self-maintained. Update this file as you learn about new services or infrastructure changes. Deep details belong in the company knowledge base (`oxsci-knowledge` skill)._

## Account

- **Account ID:** `000373574646`
- **Region:** `ap-southeast-1` (Singapore)
- **Infrastructure repo:** `oxsci-deploy` — CloudFormation templates, ECS deploy scripts, Lambda functions

## Repo → Infrastructure Mapping

| Repo | Service Type | Test | Prod | Notes |
|------|-------------|------|------|-------|
| `oxsci-bff` | ECS Fargate | ✅ | ✅ | Backend-for-frontend |
| `oxsci-data-service` | ECS Fargate | ✅ | ✅ | Data service |
| `oxsci-oma-core` | ECS Fargate | ✅ | ✅ | OMA core service |
| `oxsci-journal-insight-service` | ECS Fargate | ✅ | ✅ | Journal insight |
| `oxsci-shared-core` | Library | — | — | Shared library, no deployment |
| `mcp-team-collaboration` | MCP server | — | — | Knowledge base, tools |
| `oma-journal-researcher` | — | — | — | _(discover and update)_ |
| `openclaw` (t2wei fork) | ECS Fargate | EC2 systemd | ✅ | My body — see `REPOS.md` (same dir) |

_(Update this table as you discover or deploy new services.)_

## Deployment Flow

All deployments go through `oxsci-deploy`:

```
Code repo (push) → oxsci-deploy/ecs_deploy/scripts/deploy-service.sh → ECR → ECS
```

- Service configs live in `oxsci-deploy/services/<service-name>/`
- Each service has its own Dockerfile and ECS task definition
- CloudFormation templates in `oxsci-deploy/cloudfront/` and `oxsci-deploy/lambda/`

## Key AWS Services

| Service | Usage |
|---------|-------|
| ECS Fargate | Application hosting (all product services) |
| ECR | Docker image registry |
| EFS | Shared persistent storage (OpenClaw brain) |
| EC2 | Dev environment, git operations, local builds |
| CloudFront | CDN |
| Lambda | Serverless functions |
| S3 | Static assets, data storage |

_(Add services as you encounter them. Query `oxsci-knowledge` for deep details.)_

## Internal Service Endpoints

| Service | Address | Protocol | Notes |
|---------|---------|----------|-------|
| MCP Team Collaboration | `mcp-team-collaboration-prod.oxsci.internal:8060` | JSONRPC (`POST /jsonrpc`) | Knowledge base queries |
| Data Service | `data-service-prod.oxsci.internal:8008` | REST (OpenAPI) | Persistent data, ECS management API |

_(Update as services change. These are AWS internal DNS names, only reachable from within the VPC.)_
