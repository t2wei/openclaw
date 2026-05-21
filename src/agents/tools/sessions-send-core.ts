import crypto from "node:crypto";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import {
  createSessionVisibilityGuard,
  createAgentToAgentPolicy,
  resolveEffectiveSessionToolsVisibility,
  resolveSessionReference,
  resolveSandboxedSessionToolContext,
  resolveVisibleSessionReference,
} from "./sessions-helpers.js";
import { buildAgentToAgentMessageContext } from "./sessions-send-helpers.js";

export type SessionSendContext = {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  sandboxed?: boolean;
};

export type ResolvedSessionSend = {
  resolvedKey: string;
  displayKey: string;
  sendParams: {
    message: string;
    sessionKey: string;
    idempotencyKey: string;
    deliver: boolean;
    channel: string;
    lane: string;
    extraSystemPrompt: string;
    inputProvenance: {
      kind: string;
      sourceSessionKey?: string;
      sourceChannel?: GatewayMessageChannel;
      sourceTool: string;
    };
  };
};

export type SessionSendError = {
  ok: false;
  runId: string;
  status: string;
  error: string;
  sessionKey?: string;
};

export type SessionSendResolution = ({ ok: true } & ResolvedSessionSend) | SessionSendError;

/**
 * Resolve a session target and build sendParams for `callGateway({method: "agent"})`.
 *
 * Extracts the common session resolution, permission checking, and sendParams
 * construction logic shared by `sessions_send` and `acp_send`.
 */
export async function resolveAndBuildSendParams(params: {
  sessionKey?: string;
  label?: string;
  agentId?: string;
  message: string;
  sourceTool: string;
  ctx: SessionSendContext;
}): Promise<SessionSendResolution> {
  const cfg = loadConfig();
  const { mainKey, alias, effectiveRequesterKey, restrictToSpawned } =
    resolveSandboxedSessionToolContext({
      cfg,
      agentSessionKey: params.ctx.agentSessionKey,
      sandboxed: params.ctx.sandboxed,
    });

  const a2aPolicy = createAgentToAgentPolicy(cfg);
  const sessionVisibility = resolveEffectiveSessionToolsVisibility({
    cfg,
    sandboxed: params.ctx.sandboxed === true,
  });

  const sessionKeyParam = params.sessionKey;
  const labelParam = params.label?.trim() || undefined;
  const labelAgentIdParam = params.agentId?.trim() || undefined;

  if (sessionKeyParam && labelParam) {
    return {
      ok: false,
      runId: crypto.randomUUID(),
      status: "error",
      error: "Provide either sessionKey or label (not both).",
    };
  }

  let sessionKey = sessionKeyParam;
  if (!sessionKey && labelParam) {
    const requesterAgentId = resolveAgentIdFromSessionKey(effectiveRequesterKey);
    const requestedAgentId = labelAgentIdParam ? normalizeAgentId(labelAgentIdParam) : undefined;

    if (restrictToSpawned && requestedAgentId && requestedAgentId !== requesterAgentId) {
      return {
        ok: false,
        runId: crypto.randomUUID(),
        status: "forbidden",
        error: "Sandboxed label lookup is limited to this agent",
      };
    }

    if (requesterAgentId && requestedAgentId && requestedAgentId !== requesterAgentId) {
      if (!a2aPolicy.enabled) {
        return {
          ok: false,
          runId: crypto.randomUUID(),
          status: "forbidden",
          error:
            "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
        };
      }
      if (!a2aPolicy.isAllowed(requesterAgentId, requestedAgentId)) {
        return {
          ok: false,
          runId: crypto.randomUUID(),
          status: "forbidden",
          error: "Agent-to-agent messaging denied by tools.agentToAgent.allow.",
        };
      }
    }

    const resolveParams: Record<string, unknown> = {
      label: labelParam,
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
      ...(restrictToSpawned ? { spawnedBy: effectiveRequesterKey } : {}),
    };
    let resolvedKey = "";
    try {
      const resolved = await callGateway<{ key: string }>({
        method: "sessions.resolve",
        params: resolveParams,
        timeoutMs: 10_000,
      });
      resolvedKey = typeof resolved?.key === "string" ? resolved.key.trim() : "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (restrictToSpawned) {
        return {
          ok: false,
          runId: crypto.randomUUID(),
          status: "forbidden",
          error: "Session not visible from this sandboxed agent session.",
        };
      }
      return {
        ok: false,
        runId: crypto.randomUUID(),
        status: "error",
        error: msg || `No session found with label: ${labelParam}`,
      };
    }

    if (!resolvedKey) {
      if (restrictToSpawned) {
        return {
          ok: false,
          runId: crypto.randomUUID(),
          status: "forbidden",
          error: "Session not visible from this sandboxed agent session.",
        };
      }
      return {
        ok: false,
        runId: crypto.randomUUID(),
        status: "error",
        error: `No session found with label: ${labelParam}`,
      };
    }
    sessionKey = resolvedKey;
  }

  if (!sessionKey) {
    return {
      ok: false,
      runId: crypto.randomUUID(),
      status: "error",
      error: "Either sessionKey or label is required",
    };
  }

  const resolvedSession = await resolveSessionReference({
    sessionKey,
    alias,
    mainKey,
    requesterInternalKey: effectiveRequesterKey,
    restrictToSpawned,
  });
  if (!resolvedSession.ok) {
    return {
      ok: false,
      runId: crypto.randomUUID(),
      status: resolvedSession.status,
      error: resolvedSession.error,
    };
  }

  const visibleSession = await resolveVisibleSessionReference({
    resolvedSession,
    requesterSessionKey: effectiveRequesterKey,
    restrictToSpawned,
    visibilitySessionKey: sessionKey,
  });
  if (!visibleSession.ok) {
    return {
      ok: false,
      runId: crypto.randomUUID(),
      status: visibleSession.status,
      error: visibleSession.error,
      sessionKey: visibleSession.displayKey,
    };
  }

  const resolvedKey = visibleSession.key;
  const displayKey = visibleSession.displayKey;

  const visibilityGuard = await createSessionVisibilityGuard({
    action: "send",
    requesterSessionKey: effectiveRequesterKey,
    visibility: sessionVisibility,
    a2aPolicy,
  });
  const access = visibilityGuard.check(resolvedKey);
  if (!access.allowed) {
    return {
      ok: false,
      runId: crypto.randomUUID(),
      status: access.status,
      error: access.error,
      sessionKey: displayKey,
    };
  }

  const agentMessageContext = buildAgentToAgentMessageContext({
    requesterSessionKey: params.ctx.agentSessionKey,
    requesterChannel: params.ctx.agentChannel,
    targetSessionKey: displayKey,
  });

  const idempotencyKey = crypto.randomUUID();
  const sendParams = {
    message: params.message,
    sessionKey: resolvedKey,
    idempotencyKey,
    deliver: false,
    channel: INTERNAL_MESSAGE_CHANNEL,
    lane: AGENT_LANE_NESTED,
    extraSystemPrompt: agentMessageContext,
    inputProvenance: {
      kind: "inter_session" as const,
      sourceSessionKey: params.ctx.agentSessionKey,
      sourceChannel: params.ctx.agentChannel,
      sourceTool: params.sourceTool,
    },
  };

  return {
    ok: true,
    resolvedKey,
    displayKey,
    sendParams,
  };
}
