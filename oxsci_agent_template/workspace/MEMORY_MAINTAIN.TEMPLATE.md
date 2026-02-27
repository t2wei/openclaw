# Daily Memory Maintenance

_This file is read by the daily maintenance cron job. Do not load at startup._

## Tasks

### 1. Daily log → Detail extraction

Read yesterday's and today's `memory/YYYY-MM-DD.md`. For each entry, check if the information is already reflected in the corresponding detail file. Only extract **new** content:

- Colleague impressions → `memory/people/{user_id}.md` Observations
- Repo technical notes → `memory/repos/{repo_name}.md` Notes
- Behavioral lessons → `memory/SELF.md` Behavioral Rules

### 2. SELF.md overflow check

If Behavioral Rules > 20 items, classify each:

- Personal behavioral rule → stays in SELF.md
- Technical knowledge → push to KB via `oxsci-knowledge` or add to relevant index file
- Then remove the migrated item from SELF.md

### 3. Detail → KB promotion

Review detail files touched recently. Has any knowledge matured enough to be authoritative and useful to non-AI colleagues? If so, push to KB via `oxsci-knowledge`.

### 4. docs/ cleanup

Scan `docs/` for stale files (untouched > 1 week):

- Shared value as live knowledge? → Push to KB via `oxsci-knowledge`
- Shared value as historical record? → Archive via `oxsci-archive`
- Personal lessons only? → Distill to `memory/SELF.md`
- Neither? → Delete

### 5. Workspace commit

If any memory/ or docs/ files changed during this maintenance run, commit and push.
