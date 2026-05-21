import type { SessionVisibilityConfig } from "../config/types.gateway.js";

export type SessionVisibilityContext = {
  authUser?: string;
  authClaims?: Record<string, unknown>;
};

export type SessionVisibilityDecision =
  | { allowed: false }
  | { allowed: true; isAdmin: boolean; peerIds: string[] };

function resolveClaimValue(
  claims: Record<string, unknown> | undefined,
  claimField: string | undefined,
): string | undefined {
  if (!claims || !claimField) {
    return undefined;
  }
  const value = claims[claimField];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

/**
 * Evaluate session visibility rules from config against the current user context.
 *
 * Returns `null` when no sessionVisibility config is present (no filtering).
 * Returns `{ allowed: false }` when the user is rejected (e.g. org whitelist).
 * Returns `{ allowed: true, isAdmin, peerIds }` with filtering info.
 *
 * This function is auth-method-agnostic: it only consumes authUser and authClaims,
 * which can come from any auth provider (trusted-proxy JWT, Tailscale, etc.).
 */
export function evaluateSessionVisibility(
  config: SessionVisibilityConfig | undefined,
  context: SessionVisibilityContext,
): SessionVisibilityDecision | null {
  if (!config) {
    return null;
  }

  const { authUser, authClaims } = context;
  const claimsMapping = config.claims;

  // Org whitelist check (only when both config and claims are available)
  const allowedOrgs = config.allowedOrgs ?? [];
  if (allowedOrgs.length > 0) {
    const orgId = resolveClaimValue(authClaims, claimsMapping?.orgId);
    if (orgId) {
      if (!allowedOrgs.includes(orgId)) {
        return { allowed: false };
      }
    }
    // If no orgId claim available, skip org check (graceful degradation)
  }

  // Admin role bypass (only when both config and claims are available)
  const adminRoles = config.adminRoles ?? [];
  if (adminRoles.length > 0) {
    const role = resolveClaimValue(authClaims, claimsMapping?.role);
    if (role && adminRoles.includes(role)) {
      return { allowed: true, isAdmin: true, peerIds: [] };
    }
  }

  // User-to-peer mapping (uses authUser directly, no claims needed)
  const userPeers = config.userPeers ?? {};
  const peerIds = authUser ? (userPeers[authUser] ?? []) : [];

  if (peerIds.length > 0) {
    return { allowed: true, isAdmin: false, peerIds };
  }

  // Unmapped user policy
  const policy = config.unmappedPolicy ?? "none";
  if (policy === "all") {
    return { allowed: true, isAdmin: true, peerIds: [] };
  }

  // "none" policy: user can connect but sees no sessions
  return { allowed: true, isAdmin: false, peerIds: [] };
}

/**
 * Filter session rows by peer ID matching on session keys.
 * A session is visible if its key contains any of the user's peer IDs.
 */
export function filterSessionsByPeerIds<T extends { key: string }>(
  sessions: T[],
  peerIds: string[],
): T[] {
  if (peerIds.length === 0) {
    return [];
  }
  return sessions.filter((session) => peerIds.some((peerId) => session.key.includes(peerId)));
}
