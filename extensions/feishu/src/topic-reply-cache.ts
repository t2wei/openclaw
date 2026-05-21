// Per-process map from Feishu topic scope id (omt_*) to the most recently
// observed regular message id (om_*) inside that topic. This lets the
// `resolveReplyTransport` plugin hook return a valid `replyToMessageId` for
// outbound replies when the inbound carries only the topic scope id.
//
// Why: Feishu's `im.message.reply` API rejects `omt_*` as `replyToMessageId`
// — it requires an actual `om_*`. The topic scope id alone has no parent
// message to reply to. We solve this by remembering, for each observed topic,
// the most recent `om_*` we saw inside it; outbound replies use that as the
// reply target so they land *inside* the topic instead of escaping to the
// group root.
//
// Cache key: the Feishu topic id (omt_*). Topic ids are globally unique
// across all chats in the same ID space as om_*, so no per-chat scoping is
// needed.
//
// Scope: per-process Map. Lost on process restart. This is acceptable: a
// fresh process will repopulate the cache as inbound messages arrive. If a
// topic sees no inbound traffic post-restart, outbound replies fall back to
// top-level send (current behavior with no cache).

const topicReplyCache = new Map<string, string>();

/**
 * Record the most recent om_* message id observed inside the given topic.
 *
 * Called from the Feishu inbound webhook handler. A no-op when either input
 * is missing or the topic id doesn't look like a Feishu topic scope.
 */
export function rememberTopicReplyTarget(
  topicId: string | undefined | null,
  messageId: string | undefined | null,
): void {
  if (!topicId || !messageId) return;
  if (!topicId.startsWith("omt_")) return;
  topicReplyCache.set(topicId, messageId);
}

/**
 * Look up the cached om_* reply target for the given topic id.
 * Returns undefined on cache miss (or for non-omt_ inputs).
 */
export function getTopicReplyTarget(topicId: string | undefined | null): string | undefined {
  if (!topicId) return undefined;
  if (!topicId.startsWith("omt_")) return undefined;
  return topicReplyCache.get(topicId);
}

/** Test helper — clears the cache. Production code should never call this. */
export function clearTopicReplyCacheForTests(): void {
  topicReplyCache.clear();
}
