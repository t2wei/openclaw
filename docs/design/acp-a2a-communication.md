# ACP A2A Communication Design

## Problem

When the main agent spawns an ACP session (e.g., Codex, Claude Code) via `sessions_spawn`, multi-turn communication between the main agent and the ACP child has two issues:

1. **No dedicated follow-up tool.** The existing `sessions_send` tool triggers the framework's A2A flow (ping-pong + announce) on every call. This is unsuitable for ACP because:
   - `runAgentStep` has a hard 60-second timeout (`agent-step.ts` L67), but ACP agents routinely run for minutes.
   - The announce step injects a message into the target session's conversation history (side effect) then posts to the external channel, bypassing the main agent's decision on whether/how to relay.
   - Three mechanisms run simultaneously (sync wait, A2A flow, callback), causing duplicate deliveries.

2. **Callback channel routing instability.** The previous callback used `deliver: true` without explicit channel parameters. This relied on the gateway resolving the parent session's `lastChannel` at callback time, which is race-prone — if the parent session entry mutates between spawn and callback, the channel may resolve incorrectly (e.g., to `webchat` instead of `feishu`).

## Solution

### 1. `acp_send` tool — fire-and-forget follow-up

A new `acp_send` tool provides clean fire-and-forget semantics for ACP follow-ups:

- Reuses the same session resolution, permission checks, and visibility guards as `sessions_send` (extracted into `sessions-send-core.ts`).
- Calls `callGateway({method: "agent"})` and returns `{status: "accepted"}` immediately.
- Does **not** trigger the framework A2A flow (no ping-pong, no announce).
- Does **not** wait for a reply (no `agent.wait`).
- Result delivery relies entirely on the ACP callback mechanism.

**Why not reuse `sessions_send(timeoutSeconds=0)`?** While the fire-and-forget path exists in `sessions_send`, it still triggers `startA2AFlow()` unconditionally (L263). Creating a separate tool avoids the A2A side effects and provides clearer semantics for skill authors.

### 2. Shared core: `sessions-send-core.ts`

The session resolution logic (L46-234 of the original `sessions-send-tool.ts`) is extracted into `resolveAndBuildSendParams()`:

- Session key / label resolution (including `sessions.resolve` gateway call)
- Agent-to-agent policy checks
- Sandboxed session visibility enforcement
- Visibility guard checks
- `sendParams` construction (message, idempotency key, lane, provenance)

Both `sessions_send` and `acp_send` call this function, eliminating ~170 lines of duplication.

### 3. Callback channel routing fix

The A2A callback in `agent.ts` is rewritten to use explicit channel routing:

**Before:**

```typescript
callGateway({
  method: "agent",
  params: {
    sessionKey: parentKey,
    deliver: true, // gateway resolves channel from parent session entry
    // no channel/to/threadId — relies on lastChannel lookup at callback time
  },
});
```

**After:**

```typescript
const { deliveryContext: parentDelivery, threadId: parentThreadId } =
  extractDeliveryInfo(parentKey);

callGateway({
  method: "agent",
  params: {
    sessionKey: parentKey,
    deliver: true, // let parent agent's reply deliver to channel
    bestEffortDeliver: true,
    channel: parentDelivery?.channel, // explicit: "feishu", "discord", etc.
    to: parentDelivery?.to, // explicit: group/user target
    threadId: parentThreadId, // explicit: topic/thread ID
    accountId: parentDelivery?.accountId, // explicit: bot account
  },
});
```

**Key insight:** `deliver: true` + explicit `channel/to/threadId` gives us both reliable delivery and stable routing. The explicit channel parameters are resolved from the parent session's delivery context at callback time (race-safe), and `deliver: true` ensures the parent agent's reply is delivered to the external channel. The parent agent can still reply `NO_REPLY` to suppress delivery for duplicate or irrelevant callbacks.

The callback is also moved earlier in the code path (before the ACP early-return at `deliverAgentCommandResult`), ensuring it fires for all ACP turns including the initial spawn.

### 4. `extractDeliveryInfo` for race-safe channel resolution

Channel routing parameters are read from the parent session's delivery context at callback time via `extractDeliveryInfo(parentKey)` (from `config/sessions/delivery-info.ts`). This utility:

- Reads the session store to extract `{channel, to, accountId}` from the parent session entry
- Parses `:thread:` / `:topic:` markers from the session key for thread routing
- Is best-effort (catches errors gracefully)

This is race-safe because the parent session's delivery context is written at session creation and does not change across turns.

## Communication flow

```
User → Main Agent
  ↓
  sessions_spawn(runtime: "acp", agentId: "codex", mode: "session")
  ↓
  Main Agent ends turn immediately
  ↓
  [ACP agent completes turn]
  ↓
  A2A callback → injects output into Main Agent session
  ↓
  Main Agent receives callback, decides how to relay to user
  ↓ (if ACP agent asks a question)
  acp_send(sessionKey: childKey, message: "answer")
  ↓
  Main Agent ends turn immediately
  ↓
  [ACP agent completes turn]
  ↓
  A2A callback → injects output into Main Agent session
  ↓
  Main Agent relays final result to user
```

## Files changed

| File                                         | Change                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/tools/sessions-send-core.ts`     | **New.** Extracted `resolveAndBuildSendParams()` shared by `sessions_send` and `acp_send`.                                       |
| `src/agents/tools/acp-send-tool.ts`          | **New.** `acp_send` tool — fire-and-forget, no A2A flow.                                                                         |
| `src/agents/tools/sessions-cancel-tool.ts`   | **New.** `acp_cancel` tool — cancel the active turn of a spawned ACP session.                                                    |
| `src/agents/tools/sessions-send-tool.ts`     | **Refactored.** Uses `resolveAndBuildSendParams()` from core. No behavior change.                                                |
| `src/agents/openclaw-tools.ts`               | **Modified.** Registers `createAcpSendTool` and `createSessionsCancelTool`.                                                      |
| `src/commands/agent.ts`                      | **Modified.** Callback uses `deliver: true` + explicit channel routing via `extractDeliveryInfo`. Moved before ACP early-return. |
| `src/gateway/server-methods/sessions.ts`     | **Modified.** Added `sessions.cancel` RPC handler calling `acpManager.cancelSession()`.                                          |
| `src/gateway/protocol/schema/sessions.ts`    | **Modified.** Added `SessionsCancelParamsSchema`.                                                                                |
| `extensions/acpx/skills/acp-router/SKILL.md` | **Modified.** Replaced `sessions_send` with `acp_send` in ACP communication instructions.                                        |

## Design decisions

1. **No max-turn limit for `acp_send`.** Unlike the framework's A2A ping-pong (capped at 5 turns), `acp_send` has no turn limit. The main agent is idle between turns, so the user can intervene at any time. Giving agents maximum autonomy in multi-turn ACP conversations is preferred.

2. **Callback, not ping-pong.** The framework's ping-pong mechanism (`runAgentStep` alternating between sessions) was evaluated and rejected. The 60-second hard timeout makes it unsuitable for ACP agents that run for minutes. Even if the timeout were lifted, ping-pong would still overlap with the callback mechanism, creating duplicate delivery paths.

3. **`deliver: true` + explicit channel for reliable delivery.** The callback uses `deliver: true` so the parent agent's reply is delivered to the external channel, combined with explicit `channel/to/threadId/accountId` from `extractDeliveryInfo` for race-safe routing. The parent agent can still suppress delivery by replying `NO_REPLY` for duplicate or irrelevant callbacks.

4. **`sourceTool: "acp_send"` / `"acp_callback"` provenance.** Both the send and callback paths set distinct `inputProvenance.sourceTool` values, enabling downstream logic to distinguish ACP-originated messages from general agent-to-agent traffic.

5. **`acp_cancel` for ACP turn interruption.** With the A2A model, the main agent is idle between ACP turns and needs the ability to interrupt a running ACP turn (e.g., cancel a runaway Codex session). The `acp_cancel` tool calls the existing `acpManager.cancelSession()` via a new `sessions.cancel` gateway RPC. Cancel interrupts only the active turn — the session remains open for future messages. This is lighter than `sessions.reset` (which clears history) or `sessions.delete` (which removes the session entirely).
