/**
 * User-Context Client Factory
 *
 * Creates API clients that use user_access_token when available,
 * falling back to tenant_access_token.
 */

import { getValidUserAccessToken, type OAuthConfig } from "./oauth.js";
import type { FeishuDomain, FeishuOAuthConfig } from "./types.js";
import type { ResolvedFeishuAccount } from "./types.js";
import { userGet, userPost, type UserApiConfig } from "./user-api.js";
import { getUserToken, hasValidToken, listUserTokens } from "./user-token-store.js";

export interface UserClientContext {
  account: ResolvedFeishuAccount;
  openId?: string;
  sessionKey?: string;
}

export interface UserClientResult {
  mode: "user" | "app";
  userAccessToken?: string;
  appClient?: unknown; // Lark.Client
}

/**
 * Extract open_id from session key.
 * Session key format: agent:xxx:feishu:dm:ou_xxx
 */
export function extractOpenIdFromSession(sessionKey?: string): string | undefined {
  if (!sessionKey) return undefined;

  // Match DM sessions
  const dmMatch = sessionKey.match(/feishu:dm:(ou_[a-z0-9]+)/i);
  if (dmMatch) return dmMatch[1];

  // Match user: prefix
  const userMatch = sessionKey.match(/feishu:user:(ou_[a-z0-9]+)/i);
  if (userMatch) return userMatch[1];

  return undefined;
}

/**
 * Get the first available authorized user from token store.
 * This is a fallback when session context is not available.
 */
export function getFirstAuthorizedUser(): string | undefined {
  const tokens = listUserTokens();
  const validToken = tokens.find((t) => hasValidToken(t.openId));
  return validToken?.openId;
}

/**
 * Get OAuth config from account.
 */
export function getOAuthConfig(account: ResolvedFeishuAccount): OAuthConfig | null {
  const oauth = (account.config as { oauth?: FeishuOAuthConfig }).oauth;
  if (!oauth?.enabled || !oauth.redirectUri) {
    return null;
  }

  return {
    appId: account.appId!,
    appSecret: account.appSecret!,
    domain: account.domain,
    redirectUri: oauth.redirectUri,
    scopes: oauth.scopes,
  };
}

/**
 * Check if user is authorized (has valid token).
 */
export function isUserAuthorized(openId: string): boolean {
  return hasValidToken(openId);
}

/**
 * Get user's access token if available.
 */
export async function getUserClientToken(
  account: ResolvedFeishuAccount,
  openId: string,
): Promise<string | null> {
  const oauthConfig = getOAuthConfig(account);
  if (!oauthConfig) {
    return null;
  }

  return getValidUserAccessToken(oauthConfig, openId);
}

/**
 * Build UserApiConfig for making user-context API calls.
 */
export async function buildUserApiConfig(
  account: ResolvedFeishuAccount,
  openId: string,
): Promise<UserApiConfig | null> {
  const accessToken = await getUserClientToken(account, openId);
  if (!accessToken) {
    return null;
  }

  return {
    domain: account.domain,
    accessToken,
  };
}

// ============ User-Context API Wrappers ============

/**
 * List wiki spaces with user identity.
 */
export async function userListWikiSpaces(config: UserApiConfig) {
  const res = await userGet<{ items?: unknown[] }>(config, "/open-apis/wiki/v2/spaces");

  if (res.code !== 0) {
    throw new Error(`Failed to list wiki spaces: ${res.msg}`);
  }

  return {
    spaces:
      (res.data?.items as Array<{
        space_id: string;
        name: string;
        description?: string;
        visibility?: string;
      }>) ?? [],
  };
}

/**
 * Get wiki node with user identity.
 */
export async function userGetWikiNode(config: UserApiConfig, token: string) {
  const res = await userGet<{ node: Record<string, unknown> }>(
    config,
    "/open-apis/wiki/v2/spaces/get_node",
    { token },
  );

  if (res.code !== 0) {
    throw new Error(`Failed to get wiki node: ${res.msg}`);
  }

  const node = res.data?.node;
  return {
    node_token: node?.node_token as string | undefined,
    space_id: node?.space_id as string | undefined,
    obj_token: node?.obj_token as string | undefined,
    obj_type: node?.obj_type as string | undefined,
    title: node?.title as string | undefined,
    parent_node_token: node?.parent_node_token as string | undefined,
    has_child: node?.has_child as boolean | undefined,
    creator: node?.creator as string | undefined,
    create_time: node?.node_create_time as string | undefined,
  };
}

/**
 * List wiki nodes with user identity.
 */
export async function userListWikiNodes(
  config: UserApiConfig,
  spaceId: string,
  parentNodeToken?: string,
) {
  const params: Record<string, string> = {};
  if (parentNodeToken) {
    params.parent_node_token = parentNodeToken;
  }

  const res = await userGet<{ items?: unknown[] }>(
    config,
    `/open-apis/wiki/v2/spaces/${spaceId}/nodes`,
    params,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to list wiki nodes: ${res.msg}`);
  }

  return {
    nodes:
      (res.data?.items as Array<{
        node_token: string;
        obj_token: string;
        obj_type: string;
        title: string;
        has_child: boolean;
      }>) ?? [],
  };
}

/**
 * Get document info with user identity.
 */
export async function userGetDocument(config: UserApiConfig, docToken: string) {
  const res = await userGet<{ document: Record<string, unknown> }>(
    config,
    `/open-apis/docx/v1/documents/${docToken}`,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to get document: ${res.msg}`);
  }

  const doc = res.data?.document;
  return {
    document_id: doc?.document_id as string | undefined,
    revision_id: doc?.revision_id as number | undefined,
    title: doc?.title as string | undefined,
  };
}

/**
 * List document blocks with user identity.
 */
export async function userListDocumentBlocks(config: UserApiConfig, docToken: string) {
  const res = await userGet<{ items?: unknown[] }>(
    config,
    `/open-apis/docx/v1/documents/${docToken}/blocks`,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to list document blocks: ${res.msg}`);
  }

  return {
    blocks: res.data?.items ?? [],
  };
}

/**
 * Get raw document content (plain text) with user identity.
 */
export async function userGetDocumentRawContent(config: UserApiConfig, docToken: string) {
  const res = await userGet<{ content?: string }>(
    config,
    `/open-apis/docx/v1/documents/${docToken}/raw_content`,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to get document content: ${res.msg}`);
  }

  return {
    content: res.data?.content ?? "",
  };
}

// ============ Drive API Wrappers ============

/**
 * List drive files/folders with user identity.
 */
export async function userListDriveFiles(config: UserApiConfig, folderToken?: string) {
  const params: Record<string, string> = {};
  if (folderToken) {
    params.folder_token = folderToken;
  }

  const res = await userGet<{ files?: unknown[] }>(config, "/open-apis/drive/v1/files", params);

  if (res.code !== 0) {
    throw new Error(`Failed to list drive files: ${res.msg}`);
  }

  return {
    files: res.data?.files ?? [],
  };
}

/**
 * Get file/folder info with user identity.
 */
export async function userGetDriveFileInfo(config: UserApiConfig, fileToken: string, type: string) {
  const res = await userGet<Record<string, unknown>>(
    config,
    `/open-apis/drive/v1/metas/batch_query`,
    {},
  );

  // For single file, use the meta endpoint
  const metaRes = await userPost<{ metas?: unknown[] }>(
    config,
    "/open-apis/drive/v1/metas/batch_query",
    {
      request_docs: [{ doc_token: fileToken, doc_type: type }],
    },
  );

  if (metaRes.code !== 0) {
    throw new Error(`Failed to get file info: ${metaRes.msg}`);
  }

  return {
    meta: metaRes.data?.metas?.[0] ?? null,
  };
}

/**
 * Search drive files with user identity.
 */
export async function userSearchDriveFiles(
  config: UserApiConfig,
  query: string,
  folderToken?: string,
) {
  const body: Record<string, unknown> = {
    search_key: query,
    count: 50,
  };
  if (folderToken) {
    body.folder_token = folderToken;
  }

  const res = await userPost<{ files?: unknown[] }>(
    config,
    "/open-apis/suite/docs-api/search/object",
    body,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to search drive: ${res.msg}`);
  }

  return {
    files: res.data?.files ?? [],
  };
}
