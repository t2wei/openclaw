/**
 * OAuth Module Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateAuthUrl, generateAuthCard, isOAuthConfigured } from "./oauth.js";
import {
  initUserTokenStore,
  setUserToken,
  getUserToken,
  hasValidToken,
  needsRefresh,
  removeUserToken,
  getTokenStats,
  listUserTokens,
  type UserToken,
} from "./user-token-store.js";

describe("OAuth URL Generation", () => {
  it("should generate correct auth URL for lark domain", () => {
    const url = generateAuthUrl({
      appId: "cli_test123",
      appSecret: "secret",
      domain: "lark",
      redirectUri: "https://example.com/callback",
      scopes: ["docx:document", "wiki:wiki"],
    });

    expect(url).toContain("https://open.larksuite.com");
    expect(url).toContain("app_id=cli_test123");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback");
    expect(url).toContain("scope=docx%3Adocument+wiki%3Awiki");
  });

  it("should generate correct auth URL for feishu domain", () => {
    const url = generateAuthUrl({
      appId: "cli_test123",
      appSecret: "secret",
      domain: "feishu",
      redirectUri: "https://example.com/callback",
    });

    expect(url).toContain("https://open.feishu.cn");
  });

  it("should generate auth card with correct structure", () => {
    const card = generateAuthCard(
      {
        appId: "cli_test123",
        appSecret: "secret",
        domain: "lark",
        redirectUri: "https://example.com/callback",
      },
      "ou_test_user",
    );

    expect(card).toHaveProperty("header");
    expect(card).toHaveProperty("elements");
    expect((card as { header: { title: { content: string } } }).header.title.content).toContain(
      "Authorization",
    );
  });
});

describe("OAuth Configuration Check", () => {
  it("should return true when all required fields are present", () => {
    expect(
      isOAuthConfigured({
        appId: "cli_test",
        appSecret: "secret",
        redirectUri: "https://example.com/callback",
      }),
    ).toBe(true);
  });

  it("should return false when redirectUri is missing", () => {
    expect(
      isOAuthConfigured({
        appId: "cli_test",
        appSecret: "secret",
      }),
    ).toBe(false);
  });

  it("should return false when appId is missing", () => {
    expect(
      isOAuthConfigured({
        appSecret: "secret",
        redirectUri: "https://example.com/callback",
      }),
    ).toBe(false);
  });
});

describe("User Token Store", () => {
  const testDir = path.join(os.tmpdir(), `feishu-oauth-test-${Date.now()}`);
  const testStorePath = path.join(testDir, "tokens.json");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    initUserTokenStore({ storagePath: testStorePath });
    // Clear any existing tokens
    for (const token of listUserTokens()) {
      removeUserToken(token.openId);
    }
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("should store and retrieve a token", () => {
    const token: UserToken = {
      openId: "ou_test_user",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      accessTokenExpiresAt: Date.now() + 3600 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(token);
    const retrieved = getUserToken("ou_test_user");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.accessToken).toBe("access_123");
  });

  it("should return null for non-existent token", () => {
    const token = getUserToken("ou_nonexistent");
    expect(token).toBeNull();
  });

  it("should detect valid token", () => {
    const token: UserToken = {
      openId: "ou_valid",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      accessTokenExpiresAt: Date.now() + 3600 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(token);
    expect(hasValidToken("ou_valid")).toBe(true);
    expect(hasValidToken("ou_invalid")).toBe(false);
  });

  it("should detect when token needs refresh", () => {
    const token: UserToken = {
      openId: "ou_expiring",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      accessTokenExpiresAt: Date.now() + 60 * 1000, // Expires in 1 minute
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(token);
    // Default refresh buffer is 5 minutes, so this should need refresh
    expect(needsRefresh("ou_expiring")).toBe(true);
  });

  it("should remove token", () => {
    const token: UserToken = {
      openId: "ou_remove",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      accessTokenExpiresAt: Date.now() + 3600 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(token);
    expect(hasValidToken("ou_remove")).toBe(true);

    removeUserToken("ou_remove");
    expect(hasValidToken("ou_remove")).toBe(false);
  });

  it("should report token stats", () => {
    const validToken: UserToken = {
      openId: "ou_valid",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      accessTokenExpiresAt: Date.now() + 3600 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const expiringToken: UserToken = {
      openId: "ou_expiring",
      accessToken: "access_789",
      refreshToken: "refresh_012",
      accessTokenExpiresAt: Date.now() + 60 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(validToken);
    setUserToken(expiringToken);

    const stats = getTokenStats();
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(1);
    expect(stats.needsRefresh).toBe(1);
  });

  it("should persist tokens to disk", () => {
    const token: UserToken = {
      openId: "ou_persist",
      accessToken: "access_persist",
      refreshToken: "refresh_persist",
      accessTokenExpiresAt: Date.now() + 3600 * 1000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserToken(token);

    // Verify file exists and contains the token
    expect(fs.existsSync(testStorePath)).toBe(true);
    const fileContent = JSON.parse(fs.readFileSync(testStorePath, "utf-8"));
    expect(fileContent["ou_persist"]).toBeDefined();
    expect(fileContent["ou_persist"].accessToken).toBe("access_persist");
  });
});
