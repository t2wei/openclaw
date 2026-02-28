# Daily Memory Maintenance

## Phase 1: Daily Log → Detail Extraction

Read recent daily logs: `memory/YYYY-MM-DD.md` (today and yesterday).

For each entry, check if already reflected in the corresponding detail file. Only extract **new** content:

- Colleague impressions/observations → `memory/people/{user_id}.md`
- Repo technical notes → `memory/repos/{repo_name}.md`
- Infrastructure changes → `memory/AWS.md`
- Behavioral lessons → `memory/SELF.md`

Don't copy — distill.

## Phase 2: SELF.md Overflow Check

If `memory/SELF.md` behavioral rules exceed 20 items:

1. Classify each rule:
   - Personal behavioral rule → stays in SELF.md
   - Technical knowledge → push to KB via `oxsci-knowledge`
   - Domain-specific → move to relevant index file
2. Remove migrated items from SELF.md

## Phase 3: Knowledge Promotion

Review detail files modified yesterday. For each newly added or significantly updated knowledge, apply:

**Push to KB when ALL true:**

- Useful to non-AI colleagues
- Unlikely to go stale quickly
- Represents a pattern or principle (not a one-off fix)
- Self-contained enough without surrounding context

**Do NOT push:**

- One-time task records
- Temporary decisions
- Personal AI observations about colleagues
- Implementation details better found by reading code

Before pushing, use `oxsci-knowledge` to check for existing similar snippets. Update instead of duplicate.

## Phase 4: KB Structure Audit

Use `oxsci-knowledge` to list current scenarios and knowledge items. Check for:

- **Duplicate or overlapping snippets** — merge, keep the more complete version
- **Empty or single-snippet knowledge items** — consider merging into existing
- **Stale snippets** — update or archive outdated information
- **Naming consistency** — scenarios: `oxsci-{domain}`, knowledge: `{topic}-{aspect}`, snippets: `{pattern}-{specific}`
- **Orphaned content** — snippets not linked to any knowledge, knowledge not linked to any scenario

Fix issues found.

## Phase 5: docs/ Cleanup

Scan `docs/` for files untouched > 30 days:

- Shared value as live knowledge? → Push to KB
- Worth keeping as reference? → Move to `archive/`
- Personal lessons only? → Distill to `memory/SELF.md`
- Neither? → Move to `archive/`

## Phase 6: Summary

Compose a brief summary:

- Daily log entries processed
- What was extracted to detail files
- What was promoted to KB (titles)
- KB structure issues found and fixed
- What was cleaned from docs/
- Any anomalies

Deliver to Tony via Lark.

## Phase 7: KB Update Report

Send a brief report of KB changes from this maintenance run:

- Knowledge promoted to KB (titles and snippet names)
- KB structure issues fixed
- docs/ files cleaned up

3-5 bullet points max. If nothing notable happened, skip this phase.

**Delivery:** Feishu DM to Tony.
