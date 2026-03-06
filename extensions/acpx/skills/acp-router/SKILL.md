---
name: acp-router
description: Route requests for Codex, Claude Code, Pi, OpenCode, Gemini CLI, or Kimi into OpenClaw ACP runtime sessions. Use `sessions_spawn` with `mode: "run"` and wait for callbacks — do NOT poll or query session status.
user-invocable: false
---

# ACP Harness Router

When user intent is "run this in Codex/Claude Code/Pi/OpenCode/Gemini/Kimi (ACP harness)", route through ACP runtime. Do not use subagent runtime or PTY scraping.

## Intent detection

Trigger this skill when the user asks to:

- run something in Codex / Claude Code / Pi / OpenCode / Gemini / Kimi
- continue existing harness work
- relay instructions to an external coding harness

## AgentId mapping

- "codex" -> `agentId: "codex"`
- "claude" or "claude code" -> `agentId: "claude"`
- "pi" -> `agentId: "pi"`
- "opencode" -> `agentId: "opencode"`
- "gemini" or "gemini cli" -> `agentId: "gemini"`
- "kimi" or "kimi cli" -> `agentId: "kimi"`

If policy rejects the chosen id, report the error and ask the user for the allowed ACP agent id.

## How to spawn an ACP task

Use `sessions_spawn` with:

- `runtime: "acp"`
- `mode: "run"` (always — do NOT use `mode: "session"`)
- `agentId`: set explicitly
- `task`: put the full task description here

Do NOT set `thread: true` unless the user explicitly asks for a thread-bound session.

Example:

```json
{
  "task": "Write a Python script that prints hello world",
  "runtime": "acp",
  "agentId": "codex",
  "mode": "run"
}
```

## After spawning: WAIT, do NOT poll

**Critical behavior rule:** After `sessions_spawn` returns `status: "accepted"`:

1. Tell the user the task has been dispatched and you are waiting for results.
2. **End your turn immediately.** Do NOT call any of these:
   - `sessions_list` / `sessions_history` / `subagents(list)` to check status
   - `exec` to run `ps`, `grep`, or check logs
   - `sleep` / `process(poll)` to wait
3. The ACP agent's output will arrive as an **automatic callback message** in your session (with `provenance: inter_session`). Just wait for it.
4. When the callback arrives, read it and respond to the user.

**Why:** ACP runs asynchronously. The callback is injected into your session automatically when the ACP agent completes its turn. Polling wastes tokens and time.

## Multi-turn ACP interaction (ask-and-answer)

When the ACP agent asks a question (its output is a question rather than a final answer):

1. The question arrives as a callback message in your session.
2. Decide how to answer — either from context you already have, or by asking the user.
3. Use `sessions_send` to send your answer back to the ACP session:

```json
{
  "sessionKey": "<childSessionKey from spawn>",
  "message": "Your answer here"
}
```

4. After `sessions_send`, **end your turn again** and wait for the next callback.
5. Repeat until the ACP agent returns a final result.

**The ACP agent preserves context across turns** — each `sessions_send` continues the same conversation, so the agent remembers previous questions and answers.

## Error handling

- If `sessions_spawn` returns an error, report it to the user. Do NOT automatically retry with different parameters or fall back to direct CLI invocation.
- If `sessions_send` returns `status: "timeout"`, the message was still delivered — this is normal. Continue waiting for the callback.
- If the callback contains an error message (e.g., `ACP_TURN_FAILED`), report it to the user.

## What NOT to do

- Do NOT use `mode: "session"` — it requires `thread: true` which is only available in thread-bound contexts.
- Do NOT use `exec` to run `acpx` CLI commands directly. Always use `sessions_spawn` / `sessions_send`.
- Do NOT use `subagents` runtime for harness control.
- Do NOT poll session status, check logs, or run diagnostic commands after spawning.
- Do NOT use `sessions_list` or `sessions_history` to monitor ACP progress.
