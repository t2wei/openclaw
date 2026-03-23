import { Type } from "@sinclair/typebox";
import { callGateway } from "../../gateway/call.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { resolveAndBuildSendParams } from "./sessions-send-core.js";

const AcpSendToolSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
  label: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  agentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  message: Type.String(),
});

/**
 * Fire-and-forget tool for sending messages to ACP sessions.
 *
 * Unlike `sessions_send`, this tool:
 * - Does NOT trigger the framework A2A flow (ping-pong + announce).
 * - Does NOT wait for a reply (always fire-and-forget).
 * - Result delivery relies on the ACP callback mechanism.
 *
 * Reuses session resolution, permission checking, and visibility guards
 * from the shared `resolveAndBuildSendParams` core.
 */
export function createAcpSendTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "ACP Send",
    name: "acp_send",
    description:
      "Send a follow-up message to an ACP session (fire-and-forget). The ACP agent's reply will arrive as a callback. Use sessionKey from the original sessions_spawn result.",
    parameters: AcpSendToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const message = readStringParam(params, "message", { required: true });

      const resolution = await resolveAndBuildSendParams({
        sessionKey: readStringParam(params, "sessionKey"),
        label: readStringParam(params, "label"),
        agentId: readStringParam(params, "agentId"),
        message,
        sourceTool: "acp_send",
        ctx: {
          agentSessionKey: opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          sandboxed: opts?.sandboxed,
        },
      });

      if (!resolution.ok) {
        return jsonResult({
          runId: resolution.runId,
          status: resolution.status,
          error: resolution.error,
          ...(resolution.sessionKey ? { sessionKey: resolution.sessionKey } : {}),
        });
      }

      const { displayKey, sendParams } = resolution;
      let runId: string = sendParams.idempotencyKey;

      try {
        const response = await callGateway<{ runId: string }>({
          method: "agent",
          params: sendParams,
          timeoutMs: 10_000,
        });
        if (typeof response?.runId === "string" && response.runId) {
          runId = response.runId;
        }
        // Update child session's lastCallerSessionKey so callback routes to current caller
        if (opts?.agentSessionKey) {
          void callGateway({
            method: "sessions.patch",
            params: {
              key: resolution.resolvedKey,
              lastCallerSessionKey: opts.agentSessionKey,
            },
            timeoutMs: 5_000,
          }).catch(() => {});
        }
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : typeof err === "string" ? err : "error";
        return jsonResult({
          runId,
          status: "error",
          error: messageText,
          sessionKey: displayKey,
        });
      }

      return jsonResult({
        runId,
        status: "accepted",
        sessionKey: displayKey,
      });
    },
  };
}
