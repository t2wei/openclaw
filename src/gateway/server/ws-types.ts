import type { WebSocket } from "ws";
import type { ConnectParams } from "../protocol/index.js";

export type GatewayWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  presenceKey?: string;
  clientIp?: string;
  canvasHostUrl?: string;
  canvasCapability?: string;
  canvasCapabilityExpiresAtMs?: number;
  /** Authenticated user identity (e.g. email from trusted-proxy). */
  authUser?: string;
  /** Decoded auth claims (e.g. JWT payload from trusted-proxy). */
  authClaims?: Record<string, unknown>;
};
