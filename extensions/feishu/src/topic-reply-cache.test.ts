import { beforeEach, describe, expect, test } from "vitest";

import {
  clearTopicReplyCacheForTests,
  getTopicReplyTarget,
  rememberTopicReplyTarget,
} from "./topic-reply-cache.js";

beforeEach(() => {
  clearTopicReplyCacheForTests();
});

describe("topic-reply-cache", () => {
  test("remember+lookup round-trip", () => {
    rememberTopicReplyTarget("omt_topic_a", "om_msg_1");
    expect(getTopicReplyTarget("omt_topic_a")).toBe("om_msg_1");
  });

  test("most recent om_ wins (overwrites)", () => {
    rememberTopicReplyTarget("omt_topic_a", "om_msg_1");
    rememberTopicReplyTarget("omt_topic_a", "om_msg_2");
    expect(getTopicReplyTarget("omt_topic_a")).toBe("om_msg_2");
  });

  test("different topics keep separate entries", () => {
    rememberTopicReplyTarget("omt_topic_a", "om_msg_a");
    rememberTopicReplyTarget("omt_topic_b", "om_msg_b");
    expect(getTopicReplyTarget("omt_topic_a")).toBe("om_msg_a");
    expect(getTopicReplyTarget("omt_topic_b")).toBe("om_msg_b");
  });

  test("lookup miss returns undefined", () => {
    expect(getTopicReplyTarget("omt_unknown")).toBeUndefined();
  });

  test("non-omt_ topicId is rejected on remember", () => {
    rememberTopicReplyTarget("om_not_a_topic", "om_msg_1");
    expect(getTopicReplyTarget("om_not_a_topic")).toBeUndefined();
  });

  test("non-omt_ topicId is rejected on lookup", () => {
    // Even if somehow the cache contains a non-omt_ key, lookup guards.
    rememberTopicReplyTarget("omt_real", "om_msg_x");
    expect(getTopicReplyTarget("om_real")).toBeUndefined();
  });

  test("empty / null inputs are no-ops on remember", () => {
    rememberTopicReplyTarget(undefined, "om_msg_1");
    rememberTopicReplyTarget(null, "om_msg_1");
    rememberTopicReplyTarget("", "om_msg_1");
    rememberTopicReplyTarget("omt_x", undefined);
    rememberTopicReplyTarget("omt_x", null);
    rememberTopicReplyTarget("omt_x", "");
    expect(getTopicReplyTarget("omt_x")).toBeUndefined();
  });

  test("empty / null inputs return undefined on lookup", () => {
    expect(getTopicReplyTarget(undefined)).toBeUndefined();
    expect(getTopicReplyTarget(null)).toBeUndefined();
    expect(getTopicReplyTarget("")).toBeUndefined();
  });
});
