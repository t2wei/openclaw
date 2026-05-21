import { describe, expect, it } from "vitest";
import type { SessionVisibilityConfig } from "../config/types.gateway.js";
import {
  evaluateSessionVisibility,
  filterSessionsByPeerIds,
  type SessionVisibilityContext,
} from "./session-visibility.js";

describe("evaluateSessionVisibility", () => {
  it("returns null when config is undefined", () => {
    expect(evaluateSessionVisibility(undefined, {})).toBeNull();
  });

  it("returns allowed with empty config (no rules)", () => {
    const result = evaluateSessionVisibility({}, { authUser: "alice@example.com" });
    expect(result).toEqual({ allowed: true, isAdmin: false, peerIds: [] });
  });

  describe("org whitelist", () => {
    const config: SessionVisibilityConfig = {
      claims: { orgId: "org_id" },
      allowedOrgs: ["org-1", "org-2"],
    };

    it("rejects user with non-matching org", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "alice@example.com",
        authClaims: { org_id: "org-other" },
      };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({ allowed: false });
    });

    it("allows user with matching org", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "alice@example.com",
        authClaims: { org_id: "org-1" },
      };
      const result = evaluateSessionVisibility(config, ctx);
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(true);
    });

    it("skips org check when no authClaims", () => {
      const ctx: SessionVisibilityContext = { authUser: "alice@example.com" };
      const result = evaluateSessionVisibility(config, ctx);
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(true);
    });

    it("skips org check when orgId claim field is not mapped", () => {
      const configNoClaims: SessionVisibilityConfig = {
        allowedOrgs: ["org-1"],
      };
      const ctx: SessionVisibilityContext = {
        authUser: "alice@example.com",
        authClaims: { org_id: "org-other" },
      };
      const result = evaluateSessionVisibility(configNoClaims, ctx);
      expect(result!.allowed).toBe(true);
    });
  });

  describe("admin role bypass", () => {
    const config: SessionVisibilityConfig = {
      claims: { role: "role" },
      adminRoles: ["admin", "superadmin"],
    };

    it("grants admin when role matches", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "admin@example.com",
        authClaims: { role: "admin" },
      };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: true,
        peerIds: [],
      });
    });

    it("does not grant admin for non-matching role", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "user@example.com",
        authClaims: { role: "user" },
      };
      const result = evaluateSessionVisibility(config, ctx);
      expect(result!.allowed).toBe(true);
      if (result!.allowed) {
        expect(result!.isAdmin).toBe(false);
      }
    });

    it("skips admin check when no authClaims", () => {
      const ctx: SessionVisibilityContext = { authUser: "admin@example.com" };
      const result = evaluateSessionVisibility(config, ctx);
      expect(result!.allowed).toBe(true);
      if (result!.allowed) {
        expect(result!.isAdmin).toBe(false);
      }
    });
  });

  describe("userPeers mapping", () => {
    const config: SessionVisibilityConfig = {
      userPeers: {
        "alice@example.com": ["ou_alice1", "ou_alice2"],
        "bob@example.com": ["ou_bob1"],
      },
    };

    it("returns peer IDs for mapped user", () => {
      const ctx: SessionVisibilityContext = { authUser: "alice@example.com" };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: false,
        peerIds: ["ou_alice1", "ou_alice2"],
      });
    });

    it("returns empty peerIds for unmapped user (none policy)", () => {
      const ctx: SessionVisibilityContext = { authUser: "unknown@example.com" };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: false,
        peerIds: [],
      });
    });

    it("returns empty peerIds when no authUser", () => {
      expect(evaluateSessionVisibility(config, {})).toEqual({
        allowed: true,
        isAdmin: false,
        peerIds: [],
      });
    });
  });

  describe("unmappedPolicy", () => {
    it("'all' grants admin-equivalent access", () => {
      const config: SessionVisibilityConfig = {
        userPeers: { "alice@example.com": ["ou_alice"] },
        unmappedPolicy: "all",
      };
      const ctx: SessionVisibilityContext = { authUser: "unknown@example.com" };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: true,
        peerIds: [],
      });
    });

    it("'none' returns empty peerIds (default)", () => {
      const config: SessionVisibilityConfig = {
        userPeers: { "alice@example.com": ["ou_alice"] },
        unmappedPolicy: "none",
      };
      const ctx: SessionVisibilityContext = { authUser: "unknown@example.com" };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: false,
        peerIds: [],
      });
    });
  });

  describe("combined rules", () => {
    const config: SessionVisibilityConfig = {
      claims: { role: "role", orgId: "org_id" },
      allowedOrgs: ["org-1"],
      adminRoles: ["admin"],
      userPeers: { "alice@example.com": ["ou_alice"] },
      unmappedPolicy: "none",
    };

    it("org check runs before admin check", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "admin@example.com",
        authClaims: { role: "admin", org_id: "org-wrong" },
      };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({ allowed: false });
    });

    it("admin bypasses userPeers", () => {
      const ctx: SessionVisibilityContext = {
        authUser: "admin@example.com",
        authClaims: { role: "admin", org_id: "org-1" },
      };
      expect(evaluateSessionVisibility(config, ctx)).toEqual({
        allowed: true,
        isAdmin: true,
        peerIds: [],
      });
    });
  });
});

describe("filterSessionsByPeerIds", () => {
  const sessions = [
    { key: "agent:main:direct:ou_alice1" },
    { key: "agent:main:direct:ou_bob1" },
    { key: "agent:main:feishu:group:oc_group1:topic:ou_alice1_msg123" },
    { key: "agent:main:feishu:group:oc_group2" },
    { key: "agent:codex:acp:uuid-1234" },
  ];

  it("filters DM sessions by peer ID", () => {
    const result = filterSessionsByPeerIds(sessions, ["ou_alice1"]);
    expect(result).toEqual([
      { key: "agent:main:direct:ou_alice1" },
      { key: "agent:main:feishu:group:oc_group1:topic:ou_alice1_msg123" },
    ]);
  });

  it("returns union for multiple peer IDs", () => {
    const result = filterSessionsByPeerIds(sessions, ["ou_alice1", "ou_bob1"]);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.key)).toContain("agent:main:direct:ou_alice1");
    expect(result.map((s) => s.key)).toContain("agent:main:direct:ou_bob1");
  });

  it("returns empty array when peerIds is empty", () => {
    expect(filterSessionsByPeerIds(sessions, [])).toEqual([]);
  });

  it("returns empty array when no keys match", () => {
    expect(filterSessionsByPeerIds(sessions, ["ou_nobody"])).toEqual([]);
  });
});
