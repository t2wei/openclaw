import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { OpenClawConfig } from "../runtime-api.js";

const probeFeishuMock = vi.hoisted(() => vi.fn());
const createFeishuClientMock = vi.hoisted(() => vi.fn());

// Channel runtime mocks — required because channel.ts imports the runtime
// adapter that wires real HTTP calls. The threading hooks themselves do not
// touch the runtime, but the module loader still resolves these imports.
vi.mock("./probe.js", () => ({ probeFeishu: probeFeishuMock }));
vi.mock("./client.js", () => ({ createFeishuClient: createFeishuClientMock }));
vi.mock("./channel.runtime.js", () => ({
  feishuChannelRuntime: {
    addReactionFeishu: vi.fn(),
    createPinFeishu: vi.fn(),
    editMessageFeishu: vi.fn(),
    getChatInfo: vi.fn(),
    getChatMembers: vi.fn(),
    getFeishuMemberInfo: vi.fn(),
    getMessageFeishu: vi.fn(),
    listFeishuDirectoryGroupsLive: vi.fn(),
    listFeishuDirectoryPeersLive: vi.fn(),
    listPinsFeishu: vi.fn(),
    listReactionsFeishu: vi.fn(),
    probeFeishu: probeFeishuMock,
    removePinFeishu: vi.fn(),
    removeReactionFeishu: vi.fn(),
    sendCardFeishu: vi.fn(),
    sendMessageFeishu: vi.fn(),
    feishuOutbound: { sendText: vi.fn(), sendMedia: vi.fn() },
  },
}));

// Imports must come AFTER mock declarations.
const { feishuPlugin } = await import("./channel.js");
const { clearTopicReplyCacheForTests, rememberTopicReplyTarget } =
  await import("./topic-reply-cache.js");

const cfg = {} as OpenClawConfig;

beforeEach(() => {
  clearTopicReplyCacheForTests();
});
afterEach(() => {
  clearTopicReplyCacheForTests();
});

describe("feishuPlugin.threading.resolveReplyTransport", () => {
  const resolve = feishuPlugin.threading?.resolveReplyTransport;

  test("hook is exposed on the plugin", () => {
    expect(resolve).toBeTypeOf("function");
  });

  test("non-topic threadId is passed through unchanged", () => {
    const out = resolve?.({ cfg, threadId: "om_msg_root_42", replyToId: undefined });
    expect(out).toEqual({ replyToId: undefined, threadId: "om_msg_root_42" });
  });

  test("non-topic threadId preserves caller replyToId", () => {
    const out = resolve?.({ cfg, threadId: "om_msg_root_42", replyToId: "om_explicit" });
    expect(out).toEqual({ replyToId: "om_explicit", threadId: "om_msg_root_42" });
  });

  test("omt_* with cached om_* returns the cached message as reply target", () => {
    rememberTopicReplyTarget("omt_topic_x", "om_user_msg_1");
    const out = resolve?.({ cfg, threadId: "omt_topic_x", replyToId: undefined });
    // Both fields set: reply lands inside the topic (threadId preserved) and
    // targets a real om_* message (cache lookup).
    expect(out).toEqual({ replyToId: "om_user_msg_1", threadId: "omt_topic_x" });
  });

  test("omt_* on cache miss falls back to explicit replyToId when provided", () => {
    const out = resolve?.({
      cfg,
      threadId: "omt_cold_topic",
      replyToId: "om_explicit_fallback",
    });
    expect(out).toEqual({
      replyToId: "om_explicit_fallback",
      threadId: "omt_cold_topic",
    });
  });

  test("omt_* on cache miss with no replyToId returns undefined replyToId (forces reply_in_thread fallback)", () => {
    const out = resolve?.({ cfg, threadId: "omt_cold_topic", replyToId: undefined });
    expect(out).toEqual({ replyToId: undefined, threadId: "omt_cold_topic" });
  });

  test("caller-provided replyToId beats cache for omt_* (caller is authoritative; e.g. agent replying to a specific message inside the topic)", () => {
    rememberTopicReplyTarget("omt_topic_y", "om_cached");
    const out = resolve?.({ cfg, threadId: "omt_topic_y", replyToId: "om_caller_passed" });
    expect(out).toEqual({ replyToId: "om_caller_passed", threadId: "omt_topic_y" });
  });

  test("numeric threadId (Telegram-style) is treated as non-topic and passes through", () => {
    const out = resolve?.({ cfg, threadId: 12345, replyToId: undefined });
    expect(out).toEqual({ replyToId: undefined, threadId: 12345 });
  });

  test("null/undefined threadId returns undefined replyToId", () => {
    expect(resolve?.({ cfg, threadId: null, replyToId: null })).toEqual({
      replyToId: undefined,
      threadId: null,
    });
    expect(resolve?.({ cfg, threadId: undefined, replyToId: undefined })).toEqual({
      replyToId: undefined,
      threadId: undefined,
    });
  });
});

describe("feishuPlugin.threading.resolveAutoThreadId (post-resolveReplyTransport)", () => {
  const resolve = feishuPlugin.threading?.resolveAutoThreadId;
  const baseToolContext = { currentThreadTs: undefined };

  test("returns omt_* threadId so resolveReplyTransport can translate it downstream", () => {
    const out = resolve?.({
      cfg,
      to: "chat:oc_x",
      toolContext: { ...baseToolContext, messageThreadId: "omt_topic_z" },
      replyToId: null,
    });
    // omt_* is echoed back from auto-thread; the resolveReplyTransport hook
    // (covered above) is what translates it into an om_* reply target.
    expect(out).toBe("omt_topic_z");
  });

  test("returns plain threadId when not a topic scope", () => {
    const out = resolve?.({
      cfg,
      to: "chat:oc_x",
      toolContext: { ...baseToolContext, messageThreadId: "om_thread_root" },
      replyToId: null,
    });
    expect(out).toBe("om_thread_root");
  });

  test("explicit replyToId suppresses auto-thread for non-topic sessions", () => {
    const out = resolve?.({
      cfg,
      to: "chat:oc_x",
      toolContext: { ...baseToolContext, messageThreadId: "om_thread_root" },
      replyToId: "om_explicit_reply",
    });
    expect(out).toBeUndefined();
  });

  test("explicit replyToId is overridden for omt_* sessions so the reply stays in the topic", () => {
    // Without echoing the omt_* threadId, outbound computes
    // replyInThread=false and the agent reply lands in the group root
    // even when replyTo points at a message inside the topic.
    const out = resolve?.({
      cfg,
      to: "chat:oc_x",
      toolContext: { ...baseToolContext, messageThreadId: "omt_topic_z" },
      replyToId: "om_explicit_reply",
    });
    expect(out).toBe("omt_topic_z");
  });

  test("no toolContext returns undefined", () => {
    const out = resolve?.({
      cfg,
      to: "chat:oc_x",
      toolContext: undefined,
      replyToId: null,
    });
    expect(out).toBeUndefined();
  });
});
