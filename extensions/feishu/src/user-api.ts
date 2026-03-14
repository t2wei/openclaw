/**
 * User-Context API Calls
 *
 * Makes Feishu API calls using user_access_token instead of tenant_access_token.
 * This allows accessing resources with the user's permissions.
 */

import type { FeishuDomain } from "./types.js";

export interface UserApiConfig {
  domain: FeishuDomain;
  accessToken: string;
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
  return domain.replace(/\/+$/, "");
}

/**
 * Make a GET request with user_access_token.
 */
export async function userGet<T>(
  config: UserApiConfig,
  path: string,
  params?: Record<string, string>,
): Promise<{ code: number; msg: string; data?: T }> {
  const base = getApiBase(config.domain);
  const url = new URL(`${base}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return res.json() as Promise<{ code: number; msg: string; data?: T }>;
}

/**
 * Make a POST request with user_access_token.
 */
export async function userPost<T>(
  config: UserApiConfig,
  path: string,
  body?: unknown,
): Promise<{ code: number; msg: string; data?: T }> {
  const base = getApiBase(config.domain);

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json() as Promise<{ code: number; msg: string; data?: T }>;
}

/**
 * Make a PUT request with user_access_token.
 */
export async function userPut<T>(
  config: UserApiConfig,
  path: string,
  body?: unknown,
): Promise<{ code: number; msg: string; data?: T }> {
  const base = getApiBase(config.domain);

  const res = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json() as Promise<{ code: number; msg: string; data?: T }>;
}

/**
 * Make a DELETE request with user_access_token.
 */
export async function userDelete<T>(
  config: UserApiConfig,
  path: string,
): Promise<{ code: number; msg: string; data?: T }> {
  const base = getApiBase(config.domain);

  const res = await fetch(`${base}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return res.json() as Promise<{ code: number; msg: string; data?: T }>;
}

// ============ High-Level API Wrappers ============

/**
 * Get wiki node info using user context.
 */
export async function userGetWikiNode(
  config: UserApiConfig,
  token: string,
): Promise<{
  node_token?: string;
  space_id?: string;
  obj_token?: string;
  obj_type?: string;
  title?: string;
  parent_node_token?: string;
  has_child?: boolean;
}> {
  const res = await userGet<{ node: unknown }>(config, `/open-apis/wiki/v2/spaces/get_node`, {
    token,
  });

  if (res.code !== 0) {
    throw new Error(`Failed to get wiki node: ${res.msg}`);
  }

  const node = res.data?.node as Record<string, unknown> | undefined;
  return {
    node_token: node?.node_token as string | undefined,
    space_id: node?.space_id as string | undefined,
    obj_token: node?.obj_token as string | undefined,
    obj_type: node?.obj_type as string | undefined,
    title: node?.title as string | undefined,
    parent_node_token: node?.parent_node_token as string | undefined,
    has_child: node?.has_child as boolean | undefined,
  };
}

/**
 * List wiki spaces using user context.
 */
export async function userListWikiSpaces(config: UserApiConfig): Promise<
  Array<{
    space_id: string;
    name: string;
    description?: string;
    visibility?: string;
  }>
> {
  const res = await userGet<{ items?: unknown[] }>(config, `/open-apis/wiki/v2/spaces`);

  if (res.code !== 0) {
    throw new Error(`Failed to list wiki spaces: ${res.msg}`);
  }

  return (
    (res.data?.items as Array<{
      space_id: string;
      name: string;
      description?: string;
      visibility?: string;
    }>) ?? []
  );
}

/**
 * Get document content using user context.
 */
export async function userGetDocument(
  config: UserApiConfig,
  docToken: string,
): Promise<{
  document_id?: string;
  revision_id?: number;
  title?: string;
}> {
  const res = await userGet<{ document: unknown }>(
    config,
    `/open-apis/docx/v1/documents/${docToken}`,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to get document: ${res.msg}`);
  }

  const doc = res.data?.document as Record<string, unknown> | undefined;
  return {
    document_id: doc?.document_id as string | undefined,
    revision_id: doc?.revision_id as number | undefined,
    title: doc?.title as string | undefined,
  };
}

/**
 * List document blocks using user context.
 */
export async function userListDocumentBlocks(
  config: UserApiConfig,
  docToken: string,
): Promise<unknown[]> {
  const res = await userGet<{ items?: unknown[] }>(
    config,
    `/open-apis/docx/v1/documents/${docToken}/blocks`,
  );

  if (res.code !== 0) {
    throw new Error(`Failed to list document blocks: ${res.msg}`);
  }

  return res.data?.items ?? [];
}

/**
 * List drive files using user context.
 */
export async function userListDriveFiles(
  config: UserApiConfig,
  folderToken?: string,
): Promise<unknown[]> {
  const params: Record<string, string> = {};
  if (folderToken) {
    params.folder_token = folderToken;
  }

  const res = await userGet<{ files?: unknown[] }>(config, `/open-apis/drive/v1/files`, params);

  if (res.code !== 0) {
    throw new Error(`Failed to list drive files: ${res.msg}`);
  }

  return res.data?.files ?? [];
}
