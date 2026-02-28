# Daily Session Review

## Phase 1: Session Scan

```
sessions_list(activeMinutes=1440, messageLimit=2)
```

Filter out `kind="cron"` and `kind="hook"`.

For each remaining session, assess knowledge extraction value from metadata (kind, label, displayName) and the 2-message preview.

**High-value signals:** troubleshooting, error investigation, architecture discussion, config changes, deployment issues, design decisions.

**Low-value signals:** simple Q&A, routine coding, casual chat, short acknowledgments.

Group chat: `sender_id` in conversation metadata identifies speakers (map via `memory/COLLEAGUES.md`).

## Phase 2: Deep Read

For each high-value session:

```
sessions_history(sessionKey=xxx, limit=100)
```

Focus on messages from the last ~24 hours (use timestamps). Compare against today's daily log (`memory/YYYY-MM-DD.md`). Extract **not already recorded**:

- Problem → root cause → solution patterns
- Configuration pitfalls and fixes
- Architecture decisions and reasoning
- Deployment lessons

Write to today's daily log, tag each entry with `[session-review]`.

## Phase 3: Daily Work Report

Based on sessions from Phase 1, write a daily work report. Write it like an employee reporting to their manager — what you worked on, who you collaborated with, anything notable.

**Principles:**

- Identify colleagues from session metadata, map via `memory/COLLEAGUES.md`
- No verbatim conversation content, code snippets, error details, or credentials
- Use summary descriptions, not specifics

**Delivery:** Feishu DM to Tony.
