/**
 * OAuth Callback Handler
 *
 * Handles the OAuth callback from Feishu after user authorization.
 * This needs to be integrated with the gateway's HTTP server.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { exchangeCodeForToken, type OAuthConfig } from "./oauth.js";

export interface OAuthCallbackResult {
  success: boolean;
  openId?: string;
  error?: string;
}

/**
 * Handle OAuth callback request.
 *
 * Expected URL: /feishu/oauth/callback?code=xxx&state=yyy
 *
 * @param req - HTTP request
 * @param res - HTTP response
 * @param config - OAuth configuration
 */
export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  config: OAuthConfig,
): Promise<OAuthCallbackResult> {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains the open_id

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generateErrorPage("Missing authorization code"));
      return { success: false, error: "Missing authorization code" };
    }

    // Exchange code for token, passing state as the open_id hint
    const { token } = await exchangeCodeForToken(config, code, state || undefined);

    // Success!
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(generateSuccessPage());

    return { success: true, openId: token.openId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[feishu-oauth] Callback error:", errorMessage);

    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(generateErrorPage(errorMessage));

    return { success: false, error: errorMessage };
  }
}

/**
 * Generate success HTML page with i18n support.
 */
function generateSuccessPage(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Successful / 授权成功</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 40px 60px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
    }
    p {
      color: #666;
      margin-bottom: 20px;
    }
    .close-hint {
      color: #999;
      font-size: 14px;
    }
    .lang-zh { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1 class="lang-en">Authorization Successful!</h1>
    <h1 class="lang-zh">授权成功！</h1>
    <p class="lang-en">You have granted document access to the bot.</p>
    <p class="lang-zh">你已授权机器人访问你的文档。</p>
    <p class="close-hint lang-en">You can close this window and return to Feishu.</p>
    <p class="close-hint lang-zh">你可以关闭此窗口并返回飞书。</p>
  </div>
  <script>
    // Detect language and show appropriate content
    const isZh = navigator.language.toLowerCase().startsWith('zh');
    document.querySelectorAll('.lang-en').forEach(el => el.style.display = isZh ? 'none' : 'block');
    document.querySelectorAll('.lang-zh').forEach(el => el.style.display = isZh ? 'block' : 'none');
    // Auto-close after 3 seconds
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>
`;
}

/**
 * Generate error HTML page with i18n support.
 */
function generateErrorPage(error: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Failed / 授权失败</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
    }
    .container {
      background: white;
      padding: 40px 60px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 500px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
    }
    p {
      color: #666;
      margin-bottom: 20px;
    }
    .error {
      background: #fff3f3;
      border: 1px solid #ffcdd2;
      border-radius: 8px;
      padding: 12px;
      color: #c62828;
      font-family: monospace;
      font-size: 14px;
      word-break: break-word;
    }
    .lang-zh { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1 class="lang-en">Authorization Failed</h1>
    <h1 class="lang-zh">授权失败</h1>
    <p class="lang-en">Something went wrong during authorization.</p>
    <p class="lang-zh">授权过程中出现错误。</p>
    <div class="error">${escapeHtml(error)}</div>
    <p style="margin-top: 20px;" class="lang-en">Please try again or contact support.</p>
    <p style="margin-top: 20px;" class="lang-zh">请重试或联系管理员。</p>
  </div>
  <script>
    const isZh = navigator.language.toLowerCase().startsWith('zh');
    document.querySelectorAll('.lang-en').forEach(el => el.style.display = isZh ? 'none' : 'block');
    document.querySelectorAll('.lang-zh').forEach(el => el.style.display = isZh ? 'block' : 'none');
  </script>
</body>
</html>
`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Check if a request is for the OAuth callback path.
 */
export function isOAuthCallbackRequest(req: IncomingMessage, callbackPath: string): boolean {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  return url.pathname === callbackPath;
}
