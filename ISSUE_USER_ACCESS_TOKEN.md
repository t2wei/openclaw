# Feature Request: Feishu user_access_token support for user-delegated document access

## Summary

Add support for `user_access_token` in the Feishu plugin, allowing the bot to access documents, wikis, and bitables on behalf of the user who is chatting with it.

## Problem Statement

Currently, the Feishu plugin only uses `tenant_access_token` (application identity) to access Feishu APIs. This has significant limitations:

1. **Documents must be explicitly shared with the app** - Each document needs to have the app added as a collaborator
2. **Wiki spaces have no app authorization entry** - There's no way to grant app access to wiki spaces
3. **No permission isolation** - The app has the same access for all users
4. **Security concerns** - A single app token can access all shared resources

## Proposed Solution

Implement OAuth-based `user_access_token` support:

### User Flow

```
User sends message → Check if user has valid token
    ↓ No token
Send authorization card → User clicks to authorize
    ↓
OAuth callback → Exchange code for tokens
    ↓
Store refresh_token → Use user_access_token for API calls
```

### Benefits

| Aspect           | tenant_access_token         | user_access_token          |
| ---------------- | --------------------------- | -------------------------- |
| Document access  | Only explicitly shared docs | All docs user can see      |
| Wiki access      | ❌ No authorization entry   | ✅ User's wiki permissions |
| Permission scope | App-wide                    | Per-user                   |
| Security         | Less isolated               | Better isolation           |
| Setup complexity | Simple                      | Requires OAuth             |

### Configuration

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "oauth": {
        "enabled": true,
        "redirectUri": "https://your-domain.com/feishu/oauth/callback",
        "scopes": ["docx:document", "wiki:wiki", "drive:drive", "bitable:app"]
      }
    }
  }
}
```

### Implementation Plan

1. **Token Store** (`token-store.ts`)
   - Store user tokens indexed by `open_id`
   - Support token refresh before expiry
   - Persist to file (with encryption option)

2. **OAuth Handler** (`oauth.ts`)
   - Generate authorization URL
   - Handle callback and token exchange
   - Refresh token management

3. **User Client Factory** (`client.ts`)
   - Create clients with `user_access_token`
   - Fallback to `tenant_access_token` when user not authorized
   - Auto-refresh expired tokens

4. **Tool Integration** (`docx.ts`, `wiki.ts`, `drive.ts`, `bitable.ts`)
   - Pass current user context to tools
   - Use user client when available

5. **Bot Integration** (`bot.ts`)
   - Check user authorization status
   - Send authorization prompt card
   - Handle authorization completion

### Feishu App Configuration Required

1. Add redirect URL in app settings
2. Enable "User identity" scopes (not just "App identity")
3. Users must authorize on first use

## Additional Context

This feature addresses the common pain point where users want the bot to access their documents without manually sharing each one with the app. It's especially important for:

- Knowledge base access (wikis)
- Personal document editing
- Multi-tenant deployments with different user permissions

## Related Issues

- #13916 - Multi-Account Token Isolation (related but different)
- #16594 - Document permission management (complementary feature)
