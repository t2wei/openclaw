---
name: oxsci-ecs
description: "Manage OxSci ECS services (start, stop, restart, status) via data-service API. Use when deploying or checking service health."
---

# OxSci ECS Management Skill

Control OxSci ECS services via data-service API.

## Usage

```bash
# Check all services status
./status.sh

# Start a service
./start.sh platform-test

# Stop a service
./stop.sh platform-test

# Restart a service
./restart.sh platform-test

# Start and wait until healthy
./start-wait.sh platform-test
```

## Available Services

- `platform-test` - Main backend (test environment)
- `mcp-team-collaboration-test` - MCP service (test)
- `mcp-team-collaboration-prod` - MCP service (production)
- `data-service-test` - Data service (test)
- `data-service-prod` - Data service (production)

## API Reference

Base URL: `http://data-service-prod.oxsci.internal:8008`

- GET `/api/database/v1/system/ecs/status` - List all services
- POST `/api/database/v1/system/ecs/{service}/start` - Start service
- POST `/api/database/v1/system/ecs/{service}/stop` - Stop service
- POST `/api/database/v1/system/ecs/{service}/restart` - Restart service
- POST `/api/database/v1/ecs/start-and-wait` - Start and wait for health

## Notes

- Only works within OxSci VPC (internal DNS)
- Requires data-service to be running
- Use `start-wait.sh` for automated deployments (blocks until healthy)

---

Created: 2026-02-26 by oxsciClaw
