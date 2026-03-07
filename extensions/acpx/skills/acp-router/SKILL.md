---
name: acp-router
description: Route requests for Codex, Claude Code, Pi, OpenCode, Gemini CLI, or Kimi into OpenClaw ACP runtime sessions. Use `sessions_spawn` to create sessions and `sessions_send` for follow-ups.
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
- `agentId`: set explicitly
- `task`: put the full task description here
- `mode: "session"` — persistent session with multi-turn context
- Do NOT set `thread: true` unless the user explicitly asks for a thread-bound session (H2A mode)

Example:

```json
{
  "task": "Write a Python script that prints hello world",
  "runtime": "acp",
  "agentId": "codex",
  "mode": "session"
}
```

### Mode reference

| mode        | thread            | Behavior                                      | Use case                        |
| ----------- | ----------------- | --------------------------------------------- | ------------------------------- |
| `"session"` | `false` (default) | Persistent session, A2A via `sessions_send`   | Agent-to-agent multi-turn       |
| `"session"` | `true`            | Persistent, bound to external channel thread  | Human-to-agent via Lark/Discord |
| `"run"`     | any               | One-shot execution, session closed after turn | Single task, no follow-up       |

## After spawning: WAIT, do NOT poll

**Critical behavior rule:** After `sessions_spawn` returns `status: "accepted"`:

1. Tell the user the task has been dispatched.
2. Note the `childSessionKey` from the spawn result — you need it for follow-ups.
3. **End your turn immediately.** Do NOT call any of these:
   - `sessions_list` / `sessions_history` / `subagents(list)` to check status
   - `exec` to run `ps`, `grep`, or check logs
   - `sleep` / `process(poll)` to wait
4. The ACP agent runs asynchronously. Wait for the user to ask about results, or for a system event.

**Why:** ACP runs asynchronously. Polling wastes tokens and time.

## Multi-turn interaction via sessions_send

When you need to send follow-up messages to the ACP session (e.g., answer a question, provide more context, continue the task):

1. Use `sessions_send` with the `childSessionKey` from the spawn result:

```json
{
  "sessionKey": "<childSessionKey from spawn>",
  "message": "Your follow-up message here"
}
```

2. `sessions_send` waits for the ACP agent's reply and returns it directly (default timeout: 30s).
3. If the reply indicates the task is ongoing, you can send more messages to the same session.

**The ACP agent preserves context across turns** — each `sessions_send` continues the same conversation.

## Error handling

- If `sessions_spawn` returns an error, report it to the user. Do NOT automatically retry with different parameters.
- If `sessions_send` returns `status: "timeout"`, the message was still delivered — the agent is still working. You can try again later with a longer `timeoutSeconds`.
- If `sessions_send` returns an error, report it to the user.

## What NOT to do

- Do NOT use `exec` to run `acpx` CLI commands directly. Always use `sessions_spawn` / `sessions_send`.
- Do NOT use `subagents` runtime for harness control.
- Do NOT poll session status, check logs, or run diagnostic commands after spawning.
- Do NOT use `sessions_list` or `sessions_history` to monitor ACP progress.
