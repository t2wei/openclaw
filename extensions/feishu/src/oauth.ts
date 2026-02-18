/**
 * Feishu OAuth Module
 *
 * Handles user authorization flow for user_access_token.
 *
 * Flow:
 * 1. User sends message → Check if authorized
 * 2. If not → Send authorization card with link
 * 3. User clicks link → Redirected to Feishu authorization page
 * 4. User authorizes → Feishu redirects to callback with code
 * 5. Exchange code for tokens → Store tokens
 * 6. User can now access documents with their identity
 */

import type { FeishuDomain } from "./types.js";
import { setUserToken, getUserToken, needsRefresh, type UserToken } from "./user-token-store.js";

export interface OAuthConfig {
  appId: string;
  appSecret: string;
  domain: FeishuDomain;
  redirectUri: string;
  scopes?: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_expires_in: number; // seconds
  scope?: string;
  open_id?: string;
  union_id?: string;
  user_id?: string;
  tenant_key?: string;
}

/**
 * Get the base API URL for the domain.
 */
function getApiBase(domain: FeishuDomain): string {
  if (domain === "lark") {
    return "https://open.larksuite.com";
  }
  if (domain === "feishu") {
    return "https://open.feishu.cn";
  }
  // Custom domain
  return domain.replace(/\/+$/, "");
}

/**
 * Generate the OAuth authorization URL.
 * User should be redirected to this URL to authorize.
 */
export function generateAuthUrl(config: OAuthConfig, state?: string): string {
  const base = getApiBase(config.domain);
  const scopes = config.scopes?.join(" ") || "";

  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: scopes,
    state: state || "",
  });

  return `${base}/open-apis/authen/v1/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token.
 * @param config OAuth configuration
 * @param code Authorization code from callback
 * @param openIdHint Optional open_id from state parameter (fallback if API doesn't return it)
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  openIdHint?: string,
): Promise<{ token: UserToken; raw: TokenResponse }> {
  const base = getApiBase(config.domain);

  // First, get app_access_token
  const appTokenRes = await fetch(`${base}/open-apis/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  const appTokenData = (await appTokenRes.json()) as {
    code: number;
    msg: string;
    app_access_token?: string;
  };

  if (appTokenData.code !== 0 || !appTokenData.app_access_token) {
    throw new Error(`Failed to get app_access_token: ${appTokenData.msg}`);
  }

  // Exchange code for user_access_token
  const tokenRes = await fetch(`${base}/open-apis/authen/v1/oidc/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appTokenData.app_access_token}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    code: number;
    msg: string;
    data?: TokenResponse;
  };

  if (tokenData.code !== 0 || !tokenData.data) {
    throw new Error(`Failed to exchange code for token: ${tokenData.msg}`);
  }

  const raw = tokenData.data;
  const now = Date.now();

  const token: UserToken = {
    openId: raw.open_id || openIdHint || "",
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    accessTokenExpiresAt: now + raw.expires_in * 1000,
    refreshTokenExpiresAt: now + raw.refresh_expires_in * 1000,
    scope: raw.scope,
    tokenType: raw.token_type,
    createdAt: now,
    updatedAt: now,
  };

  // Store the token
  setUserToken(token);

  return { token, raw };
}

/**
 * Refresh an expired access token using refresh token.
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  openId: string,
): Promise<UserToken | null> {
  const existingToken = getUserToken(openId);
  if (!existingToken) {
    return null;
  }

  const base = getApiBase(config.domain);

  // Get app_access_token
  const appTokenRes = await fetch(`${base}/open-apis/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  const appTokenData = (await appTokenRes.json()) as {
    code: number;
    msg: string;
    app_access_token?: string;
  };

  if (appTokenData.code !== 0 || !appTokenData.app_access_token) {
    throw new Error(`Failed to get app_access_token: ${appTokenData.msg}`);
  }

  // Refresh user_access_token
  const refreshRes = await fetch(`${base}/open-apis/authen/v1/oidc/refresh_access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appTokenData.app_access_token}`,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: existingToken.refreshToken,
    }),
  });

  const refreshData = (await refreshRes.json()) as {
    code: number;
    msg: string;
    data?: TokenResponse;
  };

  if (refreshData.code !== 0 || !refreshData.data) {
    // Refresh failed, remove invalid token
    console.error(`[feishu-oauth] Failed to refresh token for ${openId}: ${refreshData.msg}`);
    return null;
  }

  const raw = refreshData.data;
  const now = Date.now();

  const newToken: UserToken = {
    openId,
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    accessTokenExpiresAt: now + raw.expires_in * 1000,
    refreshTokenExpiresAt: now + raw.refresh_expires_in * 1000,
    scope: raw.scope || existingToken.scope,
    tokenType: raw.token_type,
    createdAt: existingToken.createdAt,
    updatedAt: now,
  };

  setUserToken(newToken);
  return newToken;
}

/**
 * Get a valid user access token, refreshing if needed.
 */
export async function getValidUserAccessToken(
  config: OAuthConfig,
  openId: string,
): Promise<string | null> {
  const token = getUserToken(openId);
  if (!token) {
    return null;
  }

  // Check if we need to refresh
  if (needsRefresh(openId)) {
    const refreshed = await refreshAccessToken(config, openId);
    if (!refreshed) {
      return null;
    }
    return refreshed.accessToken;
  }

  return token.accessToken;
}

/**
 * i18n messages for OAuth card.
 */
const i18nMessages = {
  zh: {
    title: "🔐 需要用户授权",
    body: "要使用你的身份访问文档和知识库，请点击下方按钮授权。\n\n授权后，我就能用你的身份访问你能看到的所有内容。",
    button: "点击授权",
    note: "此授权仅限访问你有权限查看的内容",
  },
  en: {
    title: "🔐 Authorization Required",
    body: "To access your documents, wikis, and files, I need your authorization.\n\nClick the button below to grant access. You only need to do this once.",
    button: "Authorize Access",
    note: "This authorization allows me to access documents you can see, with your identity.",
  },
};

export type SupportedLocale = "zh" | "en";

/**
 * Generate an interactive card message for authorization.
 * @param config OAuth configuration
 * @param openId User's open_id
 * @param locale Language locale (default: "en")
 */
export function generateAuthCard(
  config: OAuthConfig,
  openId: string,
  locale: SupportedLocale = "en",
): object {
  const authUrl = generateAuthUrl(config, openId);
  const msg = i18nMessages[locale] || i18nMessages.en;

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: msg.title,
      },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: msg.body,
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: msg.button,
            },
            type: "primary",
            url: authUrl,
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: msg.note,
          },
        ],
      },
    ],
  };
}

/**
 * Check if OAuth is configured for an account.
 */
export function isOAuthConfigured(config: Partial<OAuthConfig>): boolean {
  return Boolean(config.appId && config.appSecret && config.redirectUri);
}
