---
name: acp-router
description: Route plain-language requests for Pi, Claude Code, Codex, Cursor, Copilot, OpenClaw ACP, OpenCode, Gemini CLI, Qwen, Kiro, Kimi, iFlow, Factory Droid, Kilocode, or ACP harness work into either OpenClaw ACP runtime sessions or direct acpx-driven sessions ("telephone game" flow). For coding-agent thread requests, read this skill first, then use only `sessions_spawn` for thread creation.
user-invocable: false
---

# ACP Harness Router

When user intent is "run this in Pi/Claude Code/Codex/Cursor/Copilot/OpenClaw/OpenCode/Gemini/Qwen/Kiro/Kimi/iFlow/Droid/Kilocode (ACP harness)", do not use subagent runtime or PTY scraping. Route through ACP-aware flows.

## Intent detection

Trigger this skill when the user asks to:

- run something in Pi / Claude Code / Codex / Cursor / Copilot / OpenClaw / OpenCode / Gemini / Qwen / Kiro / Kimi / iFlow / Droid / Kilocode
- continue existing harness work
- relay instructions to an external coding harness
- keep an external harness conversation in a thread-like conversation

Mandatory preflight for coding-agent thread requests:

- Before creating any thread for ACP harness work, read this skill first in the same turn.
- After reading, follow `OpenClaw ACP runtime path` below; do not use `message(action="thread-create")` for ACP harness thread spawn.

## Mode selection

Choose one of these paths:

1. OpenClaw ACP runtime path (default): use `sessions_spawn` / ACP runtime tools.
2. Direct `acpx` path (telephone game): use `acpx` CLI through `exec` to drive the harness session directly.

Use direct `acpx` when one of these is true:

- user explicitly asks for direct `acpx` driving
- ACP runtime/plugin path is unavailable or unhealthy
- the task is "just relay prompts to harness" and no OpenClaw ACP lifecycle features are needed

Do not use:

- `subagents` runtime for harness control
- `/acp` command delegation as a requirement for the user
- PTY scraping of supported ACP harness CLIs when `acpx` is available

## AgentId mapping

Use these defaults when user names a harness directly:

- "pi" -> `agentId: "pi"`
- "openclaw" -> `agentId: "openclaw"`
- "claude" or "claude code" -> `agentId: "claude"`
- "codex" -> `agentId: "codex"`
- "copilot" or "github copilot" -> `agentId: "copilot"`
- "cursor" or "cursor cli" -> `agentId: "cursor"`
- "droid" or "factory droid" -> `agentId: "droid"`
- "opencode" -> `agentId: "opencode"`
- "gemini" or "gemini cli" -> `agentId: "gemini"`
- "iflow" -> `agentId: "iflow"`
- "kilocode" -> `agentId: "kilocode"`
- "kimi" or "kimi cli" -> `agentId: "kimi"`
- "kiro" or "kiro cli" -> `agentId: "kiro"`
- "qwen" or "qwen code" -> `agentId: "qwen"`

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
