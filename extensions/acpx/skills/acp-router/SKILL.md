---
name: acp-router
description: Route requests for Codex, Claude Code, Pi, OpenCode, Gemini CLI, or Kimi into OpenClaw ACP runtime sessions. Use `sessions_spawn` to create sessions and `acp_send` for follow-ups.
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
| `"session"` | `false` (default) | Persistent session, A2A via `acp_send`        | Agent-to-agent multi-turn       |
| `"session"` | `true`            | Persistent, bound to external channel thread  | Human-to-agent via Lark/Discord |
| `"run"`     | any               | One-shot execution, session closed after turn | Single task, no follow-up       |

## After spawning: wait for callback

After `sessions_spawn` returns `status: "accepted"`:

1. Note the `childSessionKey` from the spawn result.
2. **End your turn immediately.** Do NOT poll, fetch history, or wait in a loop.
3. The ACP agent's first-turn output will be **automatically injected into your session** as a callback message when the agent completes its turn.
4. When you receive the callback, decide whether the agent is asking a question (continue with `acp_send`) or has delivered a final result (relay to the user).

**Why:** The ACP callback mechanism automatically injects the agent's output back into your session after each turn. You do not need to fetch it manually.

## Multi-turn interaction via acp_send

When the ACP agent asks a question or you need to send follow-up messages, use `acp_send`:

```json
{
  "sessionKey": "<childSessionKey from spawn>",
  "message": "Your follow-up message here"
}
```

`acp_send` is fire-and-forget — it delivers your message and returns `status: "accepted"` immediately. The ACP agent's reply will arrive as a callback (same as after the initial spawn).

**The ACP agent preserves context across turns** — each `acp_send` continues the same conversation.

### Communication flow

```
spawn → end turn → [callback arrives] → read reply
  ↓ (if agent asks question)
acp_send(answer) → end turn → [callback arrives] → read reply
  ↓ (if agent asks again)
acp_send(answer) → end turn → [callback arrives] → read reply
  ↓ (if agent returns final result)
relay to user
```

### Why acp_send instead of sessions_send?

- `sessions_send` triggers the framework A2A flow (ping-pong + announce), which is designed for general agent-to-agent communication but unsuitable for ACP (60s hard timeout, announce step side effects).
- `acp_send` is a clean fire-and-forget wrapper — no A2A flow, no sync wait. Result delivery is handled entirely by the ACP callback.
- `acp_send` reuses the same session resolution, permission checks, and visibility guards as `sessions_send`.

## Error handling

- If `sessions_spawn` returns an error, report it to the user. Do NOT automatically retry with different parameters.
- If `acp_send` returns an error, report it to the user.

## What NOT to do

- Do NOT use `sessions_send` for ACP follow-ups. Use `acp_send` instead.
- Do NOT use `exec` to run `acpx` CLI commands directly. Always use `sessions_spawn` / `acp_send`.
- Do NOT use `subagents` runtime for harness control.
- Do NOT poll session status, check logs, or run diagnostic commands after spawning.
- Do NOT use `sessions_list` or `sessions_history` to monitor ACP progress.
