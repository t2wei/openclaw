# Daily Memory Maintenance

## Phase 1: Daily Log → Detail Extraction

Read recent daily logs: `memory/YYYY-MM-DD.md` (today and yesterday).

For each entry, check if the information is already reflected in the corresponding detail file. Only extract **new** content:

- Colleague impressions/observations → `memory/people/{user_id}.md`
- Repo technical notes → `memory/repos/{repo_name}.md`
- Infrastructure changes → `memory/AWS.md`
- Behavioral lessons → `memory/SELF.md`

Don't copy — distill. Daily log is raw timeline; detail files are curated projections.

## Phase 2: SELF.md Overflow Check

If `memory/SELF.md` behavioral rules exceed 20 items:

1. Classify each rule:
   - Personal behavioral rule → stays in SELF.md
   - Technical knowledge → push to KB via `oxsci-knowledge`
   - Domain-specific → move to relevant index file
2. Remove migrated items from SELF.md

## Phase 3: Knowledge Promotion

Review detail files modified yesterday. For each piece of knowledge that was newly added or significantly updated, apply the promotion test:

**Push to KB when ALL of these are true:**

- Useful to non-AI colleagues (not just personal AI notes)
- Unlikely to go stale quickly
- Represents a pattern or principle (not a one-off fix)
- Self-contained enough to be understood without surrounding context

**Do NOT push:**

- One-time task records
- Temporary decisions
- Personal AI observations about colleagues
- Implementation details better found by reading code

Before pushing, use `oxsci-knowledge` to check if a similar snippet already exists. If so, update the existing snippet instead of creating a duplicate.

## Phase 4: KB Structure Audit

Use `oxsci-knowledge` to list current scenarios and knowledge items. Check for:

- **Duplicate or overlapping snippets** — merge them, keep the more complete version
- **Empty or single-snippet knowledge items** — consider whether they belong in an existing knowledge item instead
- **Stale snippets** — if a snippet references outdated information (deprecated configs, old architecture), update or archive it
- **Naming consistency** — scenarios should follow `oxsci-{domain}`, knowledge items `{topic}-{aspect}`, snippets `{pattern}-{specific}`
- **Orphaned content** — snippets not linked to any knowledge, knowledge not linked to any scenario

Fix issues found. Keep the KB lean and navigable.

## Phase 5: docs/ Cleanup

Scan `docs/` for files untouched > 30 days:

- Shared value as live knowledge? → Push to KB via `oxsci-knowledge`
- Worth keeping as reference? → Move to `archive/`
- Personal lessons only? → Distill to `memory/SELF.md`
- Neither? → Move to `archive/`

## Phase 6: Summary

Compose a brief summary of what was done:

- Daily log entries processed
- What was extracted to detail files
- What was promoted to KB (titles)
- KB structure issues found and fixed
- What was cleaned from docs/
- Any anomalies

This summary will be delivered to Tony via Lark.
