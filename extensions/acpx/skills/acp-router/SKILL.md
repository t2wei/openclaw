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

## After spawning: wait for callback

After `sessions_spawn` returns `status: "accepted"`:

1. Note the `childSessionKey` from the spawn result.
2. **End your turn immediately.** Do NOT poll, fetch history, or wait in a loop.
3. The ACP agent's output will be **automatically injected into your session** as a callback message when the agent completes its turn.
4. When you receive the callback, relay the result to the user.

**Why:** In A2A mode, the framework automatically injects the ACP agent's first-turn output back into your session. You do not need to fetch it manually.

## Multi-turn interaction via sessions_send

When you need to send follow-up messages to the ACP session (e.g., answer the agent's question, provide more context, continue the task):

1. Use `sessions_send` with the `childSessionKey`:

```json
{
  "sessionKey": "<childSessionKey from spawn>",
  "message": "Your follow-up message here"
}
```

2. `sessions_send` delivers the message to the ACP agent. **End your turn immediately after calling it.**
3. The ACP agent's reply will be automatically injected into your session as a callback (same as the initial spawn).
4. When you receive the callback, relay the result to the user.
5. Do NOT rely on `sessions_send`'s return value for the ACP agent's reply — it may be empty.

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
