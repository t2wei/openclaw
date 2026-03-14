import * as Lark from "@larksuiteoapi/node-sdk";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getValidUserAccessToken, type OAuthConfig } from "./oauth.js";
import type { FeishuConfig, FeishuDomain, ResolvedFeishuAccount } from "./types.js";
import { hasValidToken } from "./user-token-store.js";

/** Default HTTP timeout for Feishu API requests (30 seconds). */
export const FEISHU_HTTP_TIMEOUT_MS = 30_000;
export const FEISHU_HTTP_TIMEOUT_MAX_MS = 300_000;
export const FEISHU_HTTP_TIMEOUT_ENV_VAR = "OPENCLAW_FEISHU_HTTP_TIMEOUT_MS";

function getWsProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  return new HttpsProxyAgent(proxyUrl);
}

// Multi-account client cache (tenant_access_token based)
const clientCache = new Map<
  string,
  {
    client: Lark.Client;
    config: { appId: string; appSecret: string; domain?: FeishuDomain; httpTimeoutMs: number };
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
 * Create an HTTP instance that delegates to the Lark SDK's default instance
 * but injects a default request timeout to prevent indefinite hangs
 * (e.g. when the Feishu API is slow, causing per-chat queue deadlocks).
 */
function createTimeoutHttpInstance(defaultTimeoutMs: number): Lark.HttpInstance {
  const base: Lark.HttpInstance = Lark.defaultHttpInstance as unknown as Lark.HttpInstance;

  function injectTimeout<D>(opts?: Lark.HttpRequestOptions<D>): Lark.HttpRequestOptions<D> {
    return { timeout: defaultTimeoutMs, ...opts } as Lark.HttpRequestOptions<D>;
  }

  return {
    request: (opts) => base.request(injectTimeout(opts)),
    get: (url, opts) => base.get(url, injectTimeout(opts)),
    post: (url, data, opts) => base.post(url, data, injectTimeout(opts)),
    put: (url, data, opts) => base.put(url, data, injectTimeout(opts)),
    patch: (url, data, opts) => base.patch(url, data, injectTimeout(opts)),
    delete: (url, opts) => base.delete(url, injectTimeout(opts)),
    head: (url, opts) => base.head(url, injectTimeout(opts)),
    options: (url, opts) => base.options(url, injectTimeout(opts)),
  };
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
  httpTimeoutMs?: number;
  config?: Pick<FeishuConfig, "httpTimeoutMs">;
};

function resolveConfiguredHttpTimeoutMs(creds: FeishuClientCredentials): number {
  const clampTimeout = (value: number): number => {
    const rounded = Math.floor(value);
    return Math.min(Math.max(rounded, 1), FEISHU_HTTP_TIMEOUT_MAX_MS);
  };

  const fromDirectField = creds.httpTimeoutMs;
  if (
    typeof fromDirectField === "number" &&
    Number.isFinite(fromDirectField) &&
    fromDirectField > 0
  ) {
    return clampTimeout(fromDirectField);
  }

  const envRaw = process.env[FEISHU_HTTP_TIMEOUT_ENV_VAR];
  if (envRaw) {
    const envValue = Number(envRaw);
    if (Number.isFinite(envValue) && envValue > 0) {
      return clampTimeout(envValue);
    }
  }

  const fromConfig = creds.config?.httpTimeoutMs;
  const timeout = fromConfig;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    return FEISHU_HTTP_TIMEOUT_MS;
  }
  return clampTimeout(timeout);
}

/**
 * Create or get a cached Feishu client for an account.
 * Accepts any object with appId, appSecret, and optional domain/accountId.
 */
export function createFeishuClient(creds: FeishuClientCredentials): Lark.Client {
  const { accountId = "default", appId, appSecret, domain } = creds;
  const defaultHttpTimeoutMs = resolveConfiguredHttpTimeoutMs(creds);

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  // Check cache
  const cached = clientCache.get(accountId);
  if (
    cached &&
    cached.config.appId === appId &&
    cached.config.appSecret === appSecret &&
    cached.config.domain === domain &&
    cached.config.httpTimeoutMs === defaultHttpTimeoutMs
  ) {
    return cached.client;
  }

  // Create new client with timeout-aware HTTP instance
  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
    httpInstance: createTimeoutHttpInstance(defaultHttpTimeoutMs),
  });

  // Cache it
  clientCache.set(accountId, {
    client,
    config: { appId, appSecret, domain, httpTimeoutMs: defaultHttpTimeoutMs },
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

  const agent = getWsProxyAgent();
  return new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveDomain(domain),
    loggerLevel: Lark.LoggerLevel.info,
    ...(agent ? { agent } : {}),
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
