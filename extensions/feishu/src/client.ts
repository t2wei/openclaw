import * as Lark from "@larksuiteoapi/node-sdk";
import { getValidUserAccessToken, type OAuthConfig } from "./oauth.js";
import type { FeishuDomain, ResolvedFeishuAccount } from "./types.js";
import { hasValidToken } from "./user-token-store.js";

// Multi-account client cache (tenant_access_token based)
const clientCache = new Map<
  string,
  {
    client: Lark.Client;
    config: { appId: string; appSecret: string; domain?: FeishuDomain };
  }
>();

// User client cache (user_access_token based)
// Key format: "accountId:openId"
const userClientCache = new Map<
  string,
  {
    client: Lark.Client;
    accessToken: string;
    expiresAt: number;
  }
>();

function resolveDomain(domain: FeishuDomain | undefined): Lark.Domain | string {
  if (domain === "lark") {
    return Lark.Domain.Lark;
  }
  if (domain === "feishu" || !domain) {
    return Lark.Domain.Feishu;
  }
  return domain.replace(/\/+$/, ""); // Custom URL for private deployment
}

/**
 * Credentials needed to create a Feishu client.
 * Both FeishuConfig and ResolvedFeishuAccount satisfy this interface.
 */
export type FeishuClientCredentials = {
  accountId?: string;
  appId?: string;
  appSecret?: string;
  domain?: FeishuDomain;
};

/**
 * Create or get a cached Feishu client for an account.
 * Accepts any object with appId, appSecret, and optional domain/accountId.
 */
export function createFeishuClient(creds: FeishuClientCredentials): Lark.Client {
  const { accountId = "default", appId, appSecret, domain } = creds;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  // Check cache
  const cached = clientCache.get(accountId);
  if (
    cached &&
    cached.config.appId === appId &&
    cached.config.appSecret === appSecret &&
    cached.config.domain === domain
  ) {
    return cached.client;
  }

  // Create new client
  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });

  // Cache it
  clientCache.set(accountId, {
    client,
    config: { appId, appSecret, domain },
  });

  return client;
}

/**
 * Create a Feishu WebSocket client for an account.
 * Note: WSClient is not cached since each call creates a new connection.
 */
export function createFeishuWSClient(account: ResolvedFeishuAccount): Lark.WSClient {
  const { accountId, appId, appSecret, domain } = account;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  return new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveDomain(domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
}

/**
 * Create an event dispatcher for an account.
 */
export function createEventDispatcher(account: ResolvedFeishuAccount): Lark.EventDispatcher {
  return new Lark.EventDispatcher({
    encryptKey: account.encryptKey,
    verificationToken: account.verificationToken,
  });
}

/**
 * Get a cached client for an account (if exists).
 */
export function getFeishuClient(accountId: string): Lark.Client | null {
  return clientCache.get(accountId)?.client ?? null;
}

/**
 * Clear client cache for a specific account or all accounts.
 */
export function clearClientCache(accountId?: string): void {
  if (accountId) {
    clientCache.delete(accountId);
    // Also clear user clients for this account
    for (const key of userClientCache.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        userClientCache.delete(key);
      }
    }
  } else {
    clientCache.clear();
    userClientCache.clear();
  }
}

/**
 * User client credentials including OAuth config and user identity.
 */
export type FeishuUserClientCredentials = FeishuClientCredentials & {
  openId: string;
  redirectUri?: string;
};

/**
 * Create a Feishu client that uses user_access_token for API calls.
 * This allows accessing documents/wikis with the user's permissions.
 *
 * @param creds - Credentials including app info and user's open_id
 * @returns Client configured with user_access_token, or null if user not authorized
 */
export async function createFeishuUserClient(
  creds: FeishuUserClientCredentials,
): Promise<Lark.Client | null> {
  const { accountId = "default", appId, appSecret, domain, openId, redirectUri } = creds;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  // Check if user has a valid token
  if (!hasValidToken(openId)) {
    return null;
  }

  const cacheKey = `${accountId}:${openId}`;

  // Build OAuth config
  const oauthConfig: OAuthConfig = {
    appId,
    appSecret,
    domain: domain || "feishu",
    redirectUri: redirectUri || "",
  };

  // Get valid access token (will refresh if needed)
  const accessToken = await getValidUserAccessToken(oauthConfig, openId);
  if (!accessToken) {
    userClientCache.delete(cacheKey);
    return null;
  }

  // Check cache - if token hasn't changed, reuse client
  const cached = userClientCache.get(cacheKey);
  if (cached && cached.accessToken === accessToken) {
    return cached.client;
  }

  // Create new client with user_access_token
  // Note: The Lark SDK doesn't directly support user_access_token in constructor,
  // so we need to use a custom token provider or make raw API calls.
  // For now, we create a client and will use raw fetch for user-context APIs.
  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });

  // Store in cache with the access token for comparison
  userClientCache.set(cacheKey, {
    client,
    accessToken,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000, // Default 2 hours
  });

  return client;
}

/**
 * Check if a user is authorized (has valid token).
 */
export function isUserAuthorized(openId: string): boolean {
  return hasValidToken(openId);
}

/**
 * Get the user's access token if available.
 * Returns null if user is not authorized.
 */
export async function getUserAccessToken(
  creds: FeishuUserClientCredentials,
): Promise<string | null> {
  const { appId, appSecret, domain, openId, redirectUri } = creds;

  if (!appId || !appSecret || !hasValidToken(openId)) {
    return null;
  }

  const oauthConfig: OAuthConfig = {
    appId,
    appSecret,
    domain: domain || "feishu",
    redirectUri: redirectUri || "",
  };

  return getValidUserAccessToken(oauthConfig, openId);
}
