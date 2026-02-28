import { describe, expect, it } from "vitest";
import { resolveMentionPlaceholders, type FeishuMessageEvent } from "./bot.js";

type Mentions = FeishuMessageEvent["message"]["mentions"];

describe("resolveMentionPlaceholders", () => {
  it("returns original text when mentions are missing", () => {
    expect(resolveMentionPlaceholders("hello world", undefined)).toBe("hello world");
  });

  it("replaces placeholder key with @Name", () => {
    const mentions: Mentions = [{ key: "@_user_1", name: "Bot", id: { open_id: "ou_bot" } }];
    expect(resolveMentionPlaceholders("@_user_1 hello", mentions)).toBe("@Bot hello");
  });

  it("preserves all mentions including bot", () => {
    const mentions: Mentions = [
      { key: "@_user_1", name: "Bot", id: { open_id: "ou_bot" } },
      { key: "@_user_2", name: "Alice", id: { open_id: "ou_alice" } },
    ];
    expect(resolveMentionPlaceholders("@_user_1 @_user_2 hello", mentions)).toBe(
      "@Bot @Alice hello",
    );
  });

  it("treats mention.key regex metacharacters as literal text", () => {
    const mentions: Mentions = [{ key: ".*", name: "Bot", id: { open_id: "ou_bot" } }];
    expect(resolveMentionPlaceholders("hello world", mentions)).toBe("hello world");
  });

  it("trims result", () => {
    const mentions: Mentions = [{ key: "@_user_1", name: "Bot", id: { open_id: "ou_bot" } }];
    expect(resolveMentionPlaceholders("  @_user_1 hello   ", mentions)).toBe("@Bot hello");
  });

  it("resolves multiple mentions in one pass", () => {
    const mentions: Mentions = [
      { key: "@_user_1", name: "Bot One", id: { open_id: "ou_bot_1" } },
      { key: "@_user_2", name: "Bot Two", id: { open_id: "ou_bot_2" } },
    ];
    expect(resolveMentionPlaceholders("@_user_1 hi @_user_2", mentions)).toBe(
      "@Bot One hi @Bot Two",
    );
  });
});
