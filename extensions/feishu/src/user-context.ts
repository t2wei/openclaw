/**
 * User Context Utilities
 *
 * Helpers for extracting user information from session context
 * and managing user-identity API calls.
 */

import { getUserAccessToken, type FeishuUserClientCredentials } from "./client.js";
import { generateAuthCard, type OAuthConfig } from "./oauth.js";
import type { FeishuDomain } from "./types.js";
import type { UserApiConfig } from "./user-api.js";
import { hasValidToken } from "./user-token-store.js";

export interface FeishuUserContext {
  openId: string;
  hasToken: boolean;
}

/**
 * Extract user's open_id from a Feishu session key.
 *
 * Session key formats:
 * - DM: agent:main:feishu:dm:ou_xxx -> ou_xxx
 * - Group: agent:main:feishu:chat:oc_xxx -> null (no specific user)
 */
export function extractUserFromSessionKey(sessionKey: string): FeishuUserContext | null {
  // Match DM session keys: agent:xxx:feishu:dm:ou_xxx or feishu:dm:ou_xxx
  const dmMatch = sessionKey.match(/feishu:dm:(ou_[a-z0-9]+)/i);
  if (dmMatch) {
    const openId = dmMatch[1];
    return {
      openId,
      hasToken: hasValidToken(openId),
    };
  }

  // Match user: prefix patterns
  const userMatch = sessionKey.match(/feishu:user:(ou_[a-z0-9]+)/i);
  if (userMatch) {
    const openId = userMatch[1];
    return {
      openId,
      hasToken: hasValidToken(openId),
    };
  }

  return null;
}

/**
 * Check if a session key is a DM (direct message) session.
 */
export function isDmSession(sessionKey: string): boolean {
  return /feishu:dm:/i.test(sessionKey);
}

/**
 * Build UserApiConfig for making API calls with user identity.
 *
 * Returns null if:
 * - Session is not a DM
 * - User is not authorized (no valid token)
 */
export async function buildUserApiConfig(params: {
  sessionKey: string;
  appId: string;
  appSecret: string;
  domain: FeishuDomain;
  redirectUri?: string;
}): Promise<UserApiConfig | null> {
  const userCtx = extractUserFromSessionKey(params.sessionKey);
  if (!userCtx) {
    return null;
  }

  const creds: FeishuUserClientCredentials = {
    appId: params.appId,
    appSecret: params.appSecret,
    domain: params.domain,
    openId: userCtx.openId,
    redirectUri: params.redirectUri,
  };

  const accessToken = await getUserAccessToken(creds);
  if (!accessToken) {
    return null;
  }

  return {
    domain: params.domain,
    accessToken,
  };
}

/**
 * Result of checking user authorization status.
 */
export type UserAuthStatus =
  | { authorized: true; openId: string }
  | { authorized: false; openId: string; authCard: object }
  | { authorized: false; openId: null; reason: "not_dm" };

/**
 * Check if the current user is authorized for user-identity API calls.
 * Returns auth card if not authorized.
 */
export function checkUserAuth(params: {
  sessionKey: string;
  oauthConfig: OAuthConfig;
}): UserAuthStatus {
  const userCtx = extractUserFromSessionKey(params.sessionKey);

  if (!userCtx) {
    return { authorized: false, openId: null, reason: "not_dm" };
  }

  if (userCtx.hasToken) {
    return { authorized: true, openId: userCtx.openId };
  }

  // User not authorized, generate auth card
  const authCard = generateAuthCard(params.oauthConfig, userCtx.openId);
  return { authorized: false, openId: userCtx.openId, authCard };
}

/**
 * Format authorization required message for tool response.
 */
export function formatAuthRequiredResponse(authStatus: UserAuthStatus): {
  error: string;
  action?: string;
  authCard?: object;
} {
  if (authStatus.authorized) {
    throw new Error("User is authorized, no error response needed");
  }

  if (authStatus.openId === null) {
    return {
      error:
        "User authorization is only available in direct messages. " +
        "Please send this request in a DM with the bot.",
    };
  }

  return {
    error: "User authorization required to access documents with your identity.",
    action: "Please click the authorization button below to grant access.",
    authCard: authStatus.authCard,
  };
}
