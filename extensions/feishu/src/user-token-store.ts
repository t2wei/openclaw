/**
 * User Access Token Store for Feishu OAuth
 *
 * Stores and manages user_access_token for each user (by open_id).
 * Tokens are persisted to disk and refreshed automatically before expiry.
 */

import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export interface UserToken {
  openId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // Unix timestamp in ms
  refreshTokenExpiresAt: number; // Unix timestamp in ms
  scope?: string;
  tokenType?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserTokenStoreConfig {
  storagePath?: string;
  refreshBeforeExpiryMs?: number; // Refresh token this many ms before expiry (default: 5 min)
}

// In-memory cache
const tokenCache = new Map<string, UserToken>();

// Default storage path
const DEFAULT_STORAGE_PATH = path.join(homedir(), ".openclaw", "feishu-user-tokens.json");

// Default refresh buffer (5 minutes before expiry)
const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let storagePath = DEFAULT_STORAGE_PATH;
let refreshBufferMs = DEFAULT_REFRESH_BUFFER_MS;

/**
 * Initialize the token store with configuration.
 */
export function initUserTokenStore(config?: UserTokenStoreConfig): void {
  if (config?.storagePath) {
    storagePath = config.storagePath;
  }
  if (config?.refreshBeforeExpiryMs !== undefined) {
    refreshBufferMs = config.refreshBeforeExpiryMs;
  }

  // Ensure directory exists
  const dir = path.dirname(storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Load existing tokens
  loadTokensFromDisk();
}

/**
 * Load tokens from disk into memory cache.
 */
function loadTokensFromDisk(): void {
  try {
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, "utf-8");
      const tokens: Record<string, UserToken> = JSON.parse(data);
      tokenCache.clear();
      for (const [openId, token] of Object.entries(tokens)) {
        tokenCache.set(openId, token);
      }
    }
  } catch (err) {
    console.error("[feishu-user-token] Failed to load tokens from disk:", err);
  }
}

/**
 * Save tokens from memory cache to disk.
 */
function saveTokensToDisk(): void {
  try {
    const tokens: Record<string, UserToken> = {};
    for (const [openId, token] of tokenCache.entries()) {
      tokens[openId] = token;
    }
    const data = JSON.stringify(tokens, null, 2);
    fs.writeFileSync(storagePath, data, { mode: 0o600 });
  } catch (err) {
    console.error("[feishu-user-token] Failed to save tokens to disk:", err);
  }
}

/**
 * Store a user's token.
 */
export function setUserToken(token: UserToken): void {
  token.updatedAt = Date.now();
  tokenCache.set(token.openId, token);
  saveTokensToDisk();
}

/**
 * Get a user's token by open_id.
 * Returns null if not found or expired (refresh token expired).
 */
export function getUserToken(openId: string): UserToken | null {
  const token = tokenCache.get(openId);
  if (!token) {
    return null;
  }

  // Check if refresh token is expired
  if (Date.now() >= token.refreshTokenExpiresAt) {
    // Refresh token expired, user needs to re-authorize
    tokenCache.delete(openId);
    saveTokensToDisk();
    return null;
  }

  return token;
}

/**
 * Check if a user's access token needs refresh.
 */
export function needsRefresh(openId: string): boolean {
  const token = getUserToken(openId);
  if (!token) {
    return false; // No token to refresh
  }

  // Check if access token is expired or about to expire
  return Date.now() >= token.accessTokenExpiresAt - refreshBufferMs;
}

/**
 * Check if a user has a valid (or refreshable) token.
 */
export function hasValidToken(openId: string): boolean {
  return getUserToken(openId) !== null;
}

/**
 * Remove a user's token.
 */
export function removeUserToken(openId: string): void {
  tokenCache.delete(openId);
  saveTokensToDisk();
}

/**
 * List all stored user tokens (for admin/debug).
 */
export function listUserTokens(): UserToken[] {
  return Array.from(tokenCache.values());
}

/**
 * Get token statistics.
 */
export function getTokenStats(): {
  total: number;
  valid: number;
  needsRefresh: number;
  expired: number;
} {
  const now = Date.now();
  let valid = 0;
  let needsRefreshCount = 0;
  let expired = 0;

  for (const token of tokenCache.values()) {
    if (now >= token.refreshTokenExpiresAt) {
      expired++;
    } else if (now >= token.accessTokenExpiresAt - refreshBufferMs) {
      needsRefreshCount++;
    } else {
      valid++;
    }
  }

  return {
    total: tokenCache.size,
    valid,
    needsRefresh: needsRefreshCount,
    expired,
  };
}
