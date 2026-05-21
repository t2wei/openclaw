---
name: acp-router
description: Route plain-language requests for Claude Code, Cursor, Copilot, OpenClaw ACP, OpenCode, Gemini CLI, Qwen, Kiro, Kimi, iFlow, Factory Droid, Kilocode, or explicit ACP harness work into either OpenClaw ACP runtime sessions or direct acpx-driven sessions ("telephone game" flow). For coding-agent thread requests, read this skill first, then use only `sessions_spawn` for thread creation. Codex chat binding defaults to the native Codex app-server plugin unless ACP is explicit or background spawn needs ACP.
user-invocable: false
---

# ACP Harness Router

When user intent is "run this in Claude Code/Cursor/Copilot/OpenClaw/OpenCode/Gemini/Qwen/Kiro/Kimi/iFlow/Droid/Kilocode (ACP harness)", do not use subagent runtime or PTY scraping. Route through ACP-aware flows.

Codex is special: plain chat/conversation binding and control should use the native Codex app-server plugin (`/codex bind`, `/codex threads`, `/codex resume`) instead of the default ACP path. Use ACP for Codex only when the user explicitly names ACP/`/acp`/acpx, or when spawning background child sessions through `sessions_spawn` where a native Codex runtime spawn is not available yet.

## Intent detection

Trigger this skill when the user asks to:

- run something in Claude Code / Cursor / Copilot / OpenClaw / OpenCode / Gemini / Qwen / Kiro / Kimi / iFlow / Droid / Kilocode
- run Codex explicitly through ACP, `/acp`, or acpx
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

```bash
${ACPX_CMD} codex sessions close oc-codex-<conversationId>
```

### Harness aliases in acpx

- `claude`
- `codex`
- `copilot`
- `cursor`
- `droid`
- `gemini`
- `iflow`
- `kilocode`
- `kimi`
- `kiro`
- `openclaw`
- `opencode`
- `qwen`

### Built-in adapter commands in acpx

Defaults are:

- `openclaw -> openclaw acp`
- `claude -> bundled @agentclientprotocol/claude-agent-acp@0.32.0`
- `codex -> bundled @zed-industries/codex-acp@0.13.0 through OpenClaw's isolated CODEX_HOME wrapper`
- `copilot -> copilot --acp --stdio`
- `cursor -> cursor-agent acp`
- `droid -> droid exec --output-format acp`
- `gemini -> gemini --acp`
- `iflow -> iflow --experimental-acp`
- `kilocode -> npx -y @kilocode/cli acp`
- `kimi -> kimi acp`
- `kiro -> kiro-cli acp`
- `opencode -> npx -y opencode-ai acp`
- `qwen -> qwen --acp`

If `~/.acpx/config.json` overrides `agents`, those overrides replace defaults.
If your local Cursor install still exposes ACP as `agent acp`, set that as the `cursor` agent override explicitly.

### Failure handling

- `acpx: command not found`:
  - for thread-spawn ACP requests, install plugin-local pinned acpx in the ACPX plugin package immediately
  - restart gateway after install and offer to run the restart automatically
  - then retry once
  - do not ask for install permission first unless policy explicitly requires it
  - do not install global `acpx` unless explicitly requested
- adapter command missing (for example `claude-agent-acp` not found):
  - for thread-spawn ACP requests, first restore built-in defaults by removing broken `~/.acpx/config.json` agent overrides
  - then retry once before offering fallback
  - if user wants binary-based overrides, install exactly the configured adapter binary
- `NO_SESSION`: run `${ACPX_CMD} <agent> sessions new --name <sessionName>` then retry prompt.
- queue busy: either wait for completion (default) or use `--no-wait` when async behavior is explicitly desired.

### Output relay

When relaying to user, return the final assistant text output from `acpx` command result. Avoid relaying raw local tool noise unless user asked for verbose logs.
