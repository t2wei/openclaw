import { formatReasoningMessage } from "openclaw/plugin-sdk/agent-runtime";
import { logTypingFailure } from "openclaw/plugin-sdk/channel-feedback";
import { createChannelMessageReplyPipeline } from "openclaw/plugin-sdk/channel-message";
import {
  formatChannelProgressDraftLineForEntry,
  isChannelProgressDraftWorkToolName,
  resolveChannelPreviewStreamMode,
  resolveChannelStreamingBlockEnabled,
} from "openclaw/plugin-sdk/channel-streaming";
import {
  resolveSendableOutboundReplyParts,
  resolveTextChunksWithFallback,
  sendMediaWithLeadingCaption,
} from "openclaw/plugin-sdk/reply-payload";
import { stripReasoningTagsFromText } from "openclaw/plugin-sdk/text-chunking";
import { resolveFeishuRuntimeAccount } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { sendMediaFeishu, shouldSuppressFeishuTextForVoiceMedia } from "./media.js";
import {
  createReplyPrefixContext,
  type ClawdbotConfig,
  type OutboundIdentity,
  type ReplyPayload,
  type RuntimeEnv,
} from "./reply-dispatcher-runtime-api.js";
import { getFeishuRuntime } from "./runtime.js";
import { sendMessageFeishu, sendStructuredCardFeishu, type CardHeaderConfig } from "./send.js";
import { FeishuStreamingSession, mergeStreamingText } from "./streaming-card.js";
import { resolveReceiveIdType } from "./targets.js";
import { addTypingIndicator, removeTypingIndicator, type TypingIndicatorState } from "./typing.js";

/** Detect if text contains markdown elements that benefit from card rendering */
function shouldUseCard(text: string): boolean {
  return /```[\s\S]*?```/.test(text) || /\|.+\|[\r\n]+\|[-:| ]+\|/.test(text);
}

/** Maximum age (ms) for a message to receive a typing indicator reaction.
 * Messages older than this are likely replays after context compaction (#30418). */
const TYPING_INDICATOR_MAX_AGE_MS = 2 * 60_000;
const MS_EPOCH_MIN = 1_000_000_000_000;
const STREAMING_START_FAILURE_BACKOFF_MS = 60_000;
const streamingStartBackoffUntilByAccount = new Map<string, number>();

function isStreamingStartBackedOff(accountId: string, now = Date.now()): boolean {
  const backoffUntil = streamingStartBackoffUntilByAccount.get(accountId);
  if (backoffUntil === undefined) {
    return false;
  }
  if (backoffUntil <= now) {
    streamingStartBackoffUntilByAccount.delete(accountId);
    return false;
  }
  return true;
}

function rememberStreamingStartFailure(accountId: string, now = Date.now()): number {
  const backoffUntil = now + STREAMING_START_FAILURE_BACKOFF_MS;
  streamingStartBackoffUntilByAccount.set(accountId, backoffUntil);
  return backoffUntil;
}

function formatMediaFallbackText(text: string | undefined, mediaUrl: string): string {
  const trimmedText = text?.trim() ?? "";
  const attachmentText = `📎 ${mediaUrl}`;
  return trimmedText ? `${trimmedText}\n\n${attachmentText}` : attachmentText;
}

export function clearFeishuStreamingStartBackoffForTests() {
  streamingStartBackoffUntilByAccount.clear();
}

function normalizeEpochMs(timestamp: number | undefined): number | undefined {
  if (!Number.isFinite(timestamp) || timestamp === undefined || timestamp <= 0) {
    return undefined;
  }
  // Defensive normalization: some payloads use seconds, others milliseconds.
  // Values below 1e12 are treated as epoch-seconds.
  return timestamp < MS_EPOCH_MIN ? timestamp * 1000 : timestamp;
}

/** Build a card header from agent identity config. */
function resolveCardHeader(
  agentId: string,
  identity: OutboundIdentity | undefined,
): CardHeaderConfig | undefined {
  const name = identity?.name?.trim() || (agentId === "main" ? "" : agentId);
  const emoji = identity?.emoji?.trim();
  const title = (emoji ? `${emoji} ${name}` : name).trim();
  if (!title) {
    return undefined;
  }
  return {
    title,
    template: identity?.theme ?? "blue",
  };
}

/** Build a card note footer from agent identity and model context. */
function resolveCardNote(
  agentId: string,
  identity: OutboundIdentity | undefined,
  prefixCtx: { model?: string; provider?: string },
): string {
  const name = identity?.name?.trim() || agentId;
  const parts: string[] = [`Agent: ${name}`];
  if (prefixCtx.model) {
    parts.push(`Model: ${prefixCtx.model}`);
  }
  if (prefixCtx.provider) {
    parts.push(`Provider: ${prefixCtx.provider}`);
  }
  return parts.join(" | ");
}

type CreateFeishuReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  chatId: string;
  allowReasoningPreview?: boolean;
  replyToMessageId?: string;
  /** When true, preserve typing indicator on reply target but send messages without reply metadata */
  skipReplyToInMessages?: boolean;
  replyInThread?: boolean;
  /** True when inbound message is already inside a thread/topic context */
  threadReply?: boolean;
  rootId?: string;
  accountId?: string;
  identity?: OutboundIdentity;
  /** Epoch ms when the inbound message was created. Used to suppress typing
   *  indicators on old/replayed messages after context compaction (#30418). */
  messageCreateTimeMs?: number;
};

export function createFeishuReplyDispatcher(params: CreateFeishuReplyDispatcherParams) {
  const core = getFeishuRuntime();
  const {
    cfg,
    agentId,
    chatId,
    replyToMessageId,
    skipReplyToInMessages,
    replyInThread,
    threadReply,
    rootId,
    accountId,
    identity,
  } = params;
  const sendReplyToMessageId = skipReplyToInMessages ? undefined : replyToMessageId;
  const threadReplyMode = threadReply === true;
  const effectiveReplyInThread = threadReplyMode ? true : replyInThread;
  const allowTopLevelReplyFallback =
    effectiveReplyInThread === true &&
    threadReplyMode &&
    rootId !== undefined &&
    sendReplyToMessageId !== undefined &&
    sendReplyToMessageId !== rootId;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  const prefixContext = createReplyPrefixContext({ cfg, agentId });

  let typingState: TypingIndicatorState | null = null;
  const { typingCallbacks } = createChannelMessageReplyPipeline({
    cfg,
    agentId,
    channel: "feishu",
    accountId,
    typing: {
      // Feishu uses emoji reactions as typing indicators (no native typing API).
      // Unlike Telegram/Discord, reactions are persistent and don't auto-expire,
      // so keepalive re-sends are unnecessary and cause repeated notifications.
      keepaliveIntervalMs: 0,
      start: async () => {
        // Check if typing indicator is enabled (default: true)
        if (!(account.config.typingIndicator ?? true)) {
          return;
        }
        if (!replyToMessageId) {
          return;
        }
        // Skip typing indicator for old messages — likely replays after context
        // compaction that would flood users with stale notifications (#30418).
        const messageCreateTimeMs = normalizeEpochMs(params.messageCreateTimeMs);
        if (
          messageCreateTimeMs !== undefined &&
          Date.now() - messageCreateTimeMs > TYPING_INDICATOR_MAX_AGE_MS
        ) {
          return;
        }
        // Feishu reactions persist until explicitly removed, so skip keepalive
        // re-adds when a reaction already exists. Re-adding the same emoji
        // triggers a new push notification for every call (#28660).
        if (typingState?.reactionId) {
          return;
        }
        typingState = await addTypingIndicator({
          cfg,
          messageId: replyToMessageId,
          accountId,
          runtime: params.runtime,
        });
      },
      stop: async () => {
        if (!typingState) {
          return;
        }
        await removeTypingIndicator({
          cfg,
          state: typingState,
          accountId,
          runtime: params.runtime,
        });
        typingState = null;
      },
      onStartError: (err) =>
        logTypingFailure({
          log: (message) => params.runtime.log?.(message),
          channel: "feishu",
          action: "start",
          error: err,
        }),
      onStopError: (err) =>
        logTypingFailure({
          log: (message) => params.runtime.log?.(message),
          channel: "feishu",
          action: "stop",
          error: err,
        }),
    },
  });

  const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, "feishu", accountId, {
    fallbackLimit: 4000,
  });
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "feishu");
  const tableMode = core.channel.text.resolveMarkdownTableMode({ cfg, channel: "feishu" });
  const renderMode = account.config?.renderMode ?? "auto";
  // Streaming mode reads through the shared resolver so both the legacy flat
  // shape (`streaming: bool`, `blockStreaming: bool`) and the new nested shape
  // (`streaming: { mode, block, ... }`) work identically.
  const streamMode = resolveChannelPreviewStreamMode(account.config, "partial");
  const streamingEnabled = streamMode !== "off" && renderMode !== "raw";
  const coreBlockStreamingEnabled =
    resolveChannelStreamingBlockEnabled(account.config) === true;
  const reasoningPreviewEnabled = streamingEnabled && params.allowReasoningPreview === true;

  let streaming: FeishuStreamingSession | null = null;
  let streamText = "";
  let lastPartial = "";
  /** Accumulated history of intermediate steps for the collapsible panel.
   *  Recorded via onToolStart (tool names) and onBlockNotify (narrations). */
  const historyEntries: string[] = [];
  /** True when the turn involved actual intermediate work (tool calls).
   *  Used to decide whether to show the history panel — the panel is a
   *  reliability fallback for Feishu topic rendering issues, so it should
   *  only appear when there is meaningful multi-step content to back up. */
  let hasToolActivity = false;
  let reasoningText = "";
  let statusLine = "";
  let snapshotBaseText = "";
  let lastSnapshotTextLength = 0;
  const deliveredFinalTexts = new Set<string>();
  let partialUpdateQueue: Promise<void> = Promise.resolve();
  let streamingStartPromise: Promise<void> | null = null;
  let streamingClosedForReply = false;
  let streamingCloseErroredForReply = false;
  type StreamTextUpdateMode = "snapshot" | "delta";

  const formatReasoningPrefix = (thinking: string): string => {
    if (!thinking) {
      return "";
    }
    const withoutLabel = thinking.replace(/^(?:Reasoning:|Thinking\.{0,3})\s*/u, "");
    const plain = withoutLabel.replace(/^_(.*)_$/gm, "$1");
    const lines = plain.split("\n").map((line) => `> ${line}`);
    return `> 💭 **Thinking**\n${lines.join("\n")}`;
  };

  const buildCombinedStreamText = (thinking: string, answer: string): string => {
    const parts: string[] = [];
    if (thinking) {
      parts.push(formatReasoningPrefix(thinking));
    }
    if (thinking && answer) {
      parts.push("\n\n---\n\n");
    }
    if (answer) {
      parts.push(answer);
    }
    if (statusLine) {
      parts.push(parts.length > 0 ? `\n\n${statusLine}` : statusLine);
    }
    return parts.join("");
  };

  const flushStreamingCardUpdate = (combined: string) => {
    partialUpdateQueue = partialUpdateQueue.then(async () => {
      if (streamingStartPromise) {
        await streamingStartPromise;
      }
      if (streaming?.isActive()) {
        await streaming.update(combined);
      }
    });
  };

  const queueStreamingUpdate = (
    nextText: string,
    options?: {
      dedupeWithLastPartial?: boolean;
      mode?: StreamTextUpdateMode;
    },
  ) => {
    if (!nextText) {
      return;
    }
    if (options?.dedupeWithLastPartial && nextText === lastPartial) {
      return;
    }
    if (options?.dedupeWithLastPartial) {
      lastPartial = nextText;
      // Partial replies are cumulative — each payload contains the full text so far.
      // Directly replace streamText to avoid the merge fallback appending duplicates.
      streamText = nextText;
    } else {
      const mode = options?.mode ?? "snapshot";
      streamText =
        mode === "delta" ? `${streamText}${nextText}` : mergeStreamingText(streamText, nextText);
    }
    const mode = options?.mode ?? "snapshot";
    if (mode === "delta") {
      streamText = `${streamText}${nextText}`;
    } else {
      const currentSnapshotText = snapshotBaseText
        ? streamText.slice(snapshotBaseText.length)
        : streamText;
      const startsNewSnapshotBlock =
        lastSnapshotTextLength >= 20 &&
        nextText.length < lastSnapshotTextLength * 0.5 &&
        !currentSnapshotText.includes(nextText);
      if (startsNewSnapshotBlock) {
        snapshotBaseText = streamText;
        streamText = `${snapshotBaseText}${nextText}`;
      } else {
        streamText = `${snapshotBaseText}${mergeStreamingText(currentSnapshotText, nextText)}`;
      }
      lastSnapshotTextLength = nextText.length;
    }
    flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
  };

  const queueReasoningUpdate = (nextThinking: string) => {
    if (!nextThinking) {
      return;
    }
    reasoningText = nextThinking;
    flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
  };

  const startStreaming = () => {
    if (
      !streamingEnabled ||
      streamingStartPromise ||
      streaming ||
      isStreamingStartBackedOff(account.accountId)
    ) {
      return;
    }
    streamingStartPromise = (async () => {
      const creds =
        account.appId && account.appSecret
          ? { appId: account.appId, appSecret: account.appSecret, domain: account.domain }
          : null;
      if (!creds) {
        return;
      }

      streaming = new FeishuStreamingSession(createFeishuClient(account), creds, (message) =>
        params.runtime.log?.(`feishu[${account.accountId}] ${message}`),
      );
      try {
        const cardHeader = resolveCardHeader(agentId, identity);
        const cardNote = resolveCardNote(agentId, identity, prefixContext.prefixContext);
        await streaming.start(chatId, resolveReceiveIdType(chatId), {
          replyToMessageId,
          replyInThread: effectiveReplyInThread,
          rootId,
          header: cardHeader,
          note: cardNote,
        });
        streamingStartBackoffUntilByAccount.delete(account.accountId);
      } catch (error) {
        rememberStreamingStartFailure(account.accountId);
        params.runtime.error?.(
          `feishu[${account.accountId}]: streaming start failed; using non-streaming card fallback for ${
            STREAMING_START_FAILURE_BACKOFF_MS / 1000
          }s: ${String(error)}`,
        );
        streaming = null;
        streamingStartPromise = null;
      }
    })();
  };

  const closeStreaming = async (options?: { markClosedForReply?: boolean }) => {
    try {
      if (streamingStartPromise) {
        await streamingStartPromise;
      }
      await partialUpdateQueue;
      if (streaming?.isActive()) {
        statusLine = "";
        const text = buildCombinedStreamText(reasoningText, streamText);
        // Show the history panel when the turn produced any intermediate
        // record — either tool activity or accumulated history entries
        // (block text / reasoning narration). Panel is a reliability
        // fallback for Feishu topic rendering: it records the full process
        // so users can review even if the streaming card renders
        // incompletely. We accept either signal because upstream's item
        // lifecycle pipeline (af81ee9fee) means tool-only events don't
        // always reach our onToolStart hook depending on provider/model.
        const shouldShowPanel = hasToolActivity || historyEntries.length > 0;
        const historyText =
          historyEntries.length > 0 ? historyEntries.join("\n\n---\n\n") : undefined;
        const finalNote = resolveCardNote(agentId, identity, prefixContext.prefixContext);
        await streaming.close(text, {
          note: finalNote,
          addFullTextPanel: shouldShowPanel,
          historyText,
          panelStyle: account.config?.historyPanel ?? undefined,
        });
        // Track the raw streamed text so the duplicate-final check in deliver()
        // can skip the redundant text delivery that arrives after onIdle closes
        // the streaming card.
        if (streamText) {
          deliveredFinalTexts.add(streamText);
          if (options?.markClosedForReply !== false && !streamingCloseErroredForReply) {
            streamingClosedForReply = true;
          }
        }
      }
    } finally {
      streaming = null;
      streamingStartPromise = null;
      partialUpdateQueue = Promise.resolve();
      streamText = "";
      lastPartial = "";
      reasoningText = "";
      statusLine = "";
      snapshotBaseText = "";
      lastSnapshotTextLength = 0;
    }
  };

  const updateStreamingStatusLine = (nextStatusLine: string) => {
    statusLine = nextStatusLine;
    if (!streaming?.isActive() && !streamingStartPromise && renderMode !== "card") {
      return;
    }
    startStreaming();
    flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
  };

  const sendChunkedTextReply = async (params: {
    text: string;
    useCard: boolean;
    infoKind?: string;
    sendChunk: (params: { chunk: string; isFirst: boolean }) => Promise<void>;
  }) => {
    const chunkSource = params.useCard
      ? params.text
      : core.channel.text.convertMarkdownTables(params.text, tableMode);
    const chunks = resolveTextChunksWithFallback(
      chunkSource,
      core.channel.text.chunkTextWithMode(chunkSource, textChunkLimit, chunkMode),
    );
    for (const [index, chunk] of chunks.entries()) {
      await params.sendChunk({
        chunk,
        isFirst: index === 0,
      });
    }
    if (params.infoKind === "final") {
      deliveredFinalTexts.add(params.text);
    }
  };

  const sendMediaReplies = async (payload: ReplyPayload, options?: { fallbackText?: string }) => {
    const mediaUrls = resolveSendableOutboundReplyParts(payload).mediaUrls;
    let sentFallbackText = false;
    await sendMediaWithLeadingCaption({
      mediaUrls,
      caption: "",
      send: async ({ mediaUrl }) => {
        const result = await sendMediaFeishu({
          cfg,
          to: chatId,
          mediaUrl,
          replyToMessageId: sendReplyToMessageId,
          replyInThread: effectiveReplyInThread,
          accountId,
          ...(payload.audioAsVoice === true ? { audioAsVoice: true } : {}),
        });
        if (result?.voiceIntentDegradedToFile && options?.fallbackText && !sentFallbackText) {
          sentFallbackText = true;
          await sendChunkedTextReply({
            text: options.fallbackText,
            useCard: false,
            infoKind: "final",
            sendChunk: async ({ chunk }) => {
              await sendMessageFeishu({
                cfg,
                to: chatId,
                text: chunk,
                replyToMessageId: sendReplyToMessageId,
                replyInThread: effectiveReplyInThread,
                allowTopLevelReplyFallback,
                accountId,
              });
            },
          });
        }
      },
      onError:
        options?.fallbackText === undefined
          ? undefined
          : async ({ mediaUrl }) => {
              const fallbackText = formatMediaFallbackText(
                sentFallbackText ? undefined : options.fallbackText,
                mediaUrl,
              );
              sentFallbackText = true;
              await sendChunkedTextReply({
                text: fallbackText,
                useCard: false,
                infoKind: "final",
                sendChunk: async ({ chunk }) => {
                  await sendMessageFeishu({
                    cfg,
                    to: chatId,
                    text: chunk,
                    replyToMessageId: sendReplyToMessageId,
                    replyInThread: effectiveReplyInThread,
                    allowTopLevelReplyFallback,
                    accountId,
                  });
                },
              });
            },
    });
  };

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      onReplyStart: async () => {
        deliveredFinalTexts.clear();
        streamingClosedForReply = false;
        streamingCloseErroredForReply = false;
        if (streamingEnabled && renderMode === "card") {
          startStreaming();
        }
        await typingCallbacks?.onReplyStart?.();
      },
      deliver: async (payload: ReplyPayload, info) => {
        const payloadText =
          payload.isReasoning && payload.text ? formatReasoningMessage(payload.text) : payload.text;
        const reply = resolveSendableOutboundReplyParts({ ...payload, text: payloadText });
        const text = reply.text;
        const hasText = reply.hasText;
        const hasMedia = reply.hasMedia;
        const hasVoiceMedia =
          hasMedia &&
          reply.mediaUrls.some((mediaUrl) =>
            shouldSuppressFeishuTextForVoiceMedia({
              mediaUrl,
              ...(payload.audioAsVoice === true ? { audioAsVoice: true } : {}),
            }),
          );
        const useCard =
          hasText &&
          (renderMode === "card" ||
            (info?.kind === "block" && coreBlockStreamingEnabled && renderMode !== "raw") ||
            (renderMode === "auto" && shouldUseCard(text)));
        const skipTextForDuplicateFinal =
          info?.kind === "final" && hasText && deliveredFinalTexts.has(text);
        const skipTextForClosedStreamingFinal =
          info?.kind === "final" &&
          hasText &&
          streamingClosedForReply &&
          !streamingCloseErroredForReply &&
          streamingEnabled &&
          useCard;
        const shouldDeliverText =
          hasText &&
          !hasVoiceMedia &&
          !skipTextForDuplicateFinal &&
          !skipTextForClosedStreamingFinal;

        if (!shouldDeliverText && !hasMedia) {
          return;
        }

        if (shouldDeliverText) {
          if (info?.kind === "block") {
            // Drop internal block chunks unless we can safely consume them as
            // streaming-card fallback content.
            if (!(streamingEnabled && useCard)) {
              return;
            }
            startStreaming();
            if (streamingStartPromise) {
              await streamingStartPromise;
            }
          }

          if (info?.kind === "final" && streamingEnabled && useCard) {
            startStreaming();
            if (streamingStartPromise) {
              await streamingStartPromise;
            }
          }

          if (streaming?.isActive()) {
            if (info?.kind === "block") {
              // Track block text in history panel (fork: streaming card history feature).
              historyEntries.push(text);
              // Some runtimes emit block payloads without onPartial/final callbacks.
              // Mirror block text into streamText so onIdle close still sends content.
              queueStreamingUpdate(text, { mode: "delta", dedupeWithLastPartial: true });
            }
            if (info?.kind === "final") {
              // Replace card content with final text. Don't close here — there may be
              // multiple final payloads (narration texts that weren't delivered as blocks
              // due to disableBlockStreaming). Let onIdle close with the last one.
              streamText = text;
              snapshotBaseText = "";
              lastSnapshotTextLength = text.length;
              flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
              deliveredFinalTexts.add(text);
            }
            // Send media even when streaming handled the text
            if (hasMedia) {
              await sendMediaReplies(payload);
            }
            return;
          }

          if (useCard) {
            const cardHeader = resolveCardHeader(agentId, identity);
            const cardNote = resolveCardNote(agentId, identity, prefixContext.prefixContext);
            await sendChunkedTextReply({
              text,
              useCard: true,
              infoKind: info?.kind,
              sendChunk: async ({ chunk }) => {
                await sendStructuredCardFeishu({
                  cfg,
                  to: chatId,
                  text: chunk,
                  replyToMessageId: sendReplyToMessageId,
                  replyInThread: effectiveReplyInThread,
                  allowTopLevelReplyFallback,
                  accountId,
                  header: cardHeader,
                  note: cardNote,
                });
              },
            });
          } else {
            await sendChunkedTextReply({
              text,
              useCard: false,
              infoKind: info?.kind,
              sendChunk: async ({ chunk }) => {
                await sendMessageFeishu({
                  cfg,
                  to: chatId,
                  text: chunk,
                  replyToMessageId: sendReplyToMessageId,
                  replyInThread: effectiveReplyInThread,
                  allowTopLevelReplyFallback,
                  accountId,
                });
              },
            });
          }
        }

        if (hasMedia) {
          await sendMediaReplies(
            payload,
            hasVoiceMedia && hasText ? { fallbackText: text } : undefined,
          );
        }
      },
      onError: async (error, info) => {
        streamingCloseErroredForReply = true;
        streamingClosedForReply = false;
        params.runtime.error?.(
          `feishu[${account.accountId}] ${info.kind} reply failed: ${String(error)}`,
        );
        await closeStreaming({ markClosedForReply: false });
        typingCallbacks?.onIdle?.();
      },
      onIdle: async () => {
        await closeStreaming();
        typingCallbacks?.onIdle?.();
      },
      onCleanup: () => {
        typingCallbacks?.onCleanup?.();
      },
    });
  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
      disableBlockStreaming: !(resolveChannelStreamingBlockEnabled(account.config) ?? false),
      onBlockNotify: (payload: { text?: string }) => {
        if (payload.text) {
          historyEntries.push(payload.text);
        }
      },
      // Upstream af81ee9fee introduced a parallel "item" lifecycle stream
      // alongside the legacy "tool" stream. Some providers/models route
      // tool progress only through items, so subscribe here to keep tool
      // labels in the history panel and mark hasToolActivity. Other
      // upstream channels (Discord/Slack/Telegram/MS Teams) already
      // consume onItemEvent — this is the symmetric Feishu wiring.
      onItemEvent: (payload: {
        kind?: string;
        phase?: string;
        title?: string;
        name?: string;
        meta?: string;
      }) => {
        if (payload.phase !== "start") {
          return;
        }
        if (payload.kind !== "tool") {
          return;
        }
        const name = payload.name?.trim();
        if (!name) {
          return;
        }
        hasToolActivity = true;
        const detail = payload.meta?.trim() ?? "";
        const label = detail ? `▶ ${name} ${detail}`.slice(0, 80) : `▶ ${name}`;
        historyEntries.push(`\`${label}\``);
      },
      onPartialReply: streamingEnabled
        ? (payload: ReplyPayload) => {
            if (!payload.text) {
              return;
            }
            // Lazy card creation on first partial text (renderMode "card").
            if (renderMode === "card") {
              startStreaming();
            }
            const cleaned = stripReasoningTagsFromText(payload.text, {
              mode: "strict",
              trim: "both",
            });
            if (!cleaned) {
              return;
            }
            queueStreamingUpdate(cleaned, {
              dedupeWithLastPartial: true,
              mode: "snapshot",
            });
          }
        : undefined,
      onReasoningStream: reasoningPreviewEnabled
        ? (payload: ReplyPayload) => {
            if (!payload.text) {
              return;
            }
            startStreaming();
            queueReasoningUpdate(formatReasoningMessage(payload.text));
          }
        : undefined,
      onReasoningEnd: reasoningPreviewEnabled ? () => {} : undefined,
      onToolStart: streamingEnabled
        ? (payload: {
            name?: string;
            phase?: string;
            args?: Record<string, unknown>;
            detailMode?: "explain" | "raw";
            meta?: string;
          }) => {
            if (payload.phase === "start" && payload.name) {
              hasToolActivity = true;
              const label = payload.meta
                ? `▶ ${payload.name} ${payload.meta}`.slice(0, 80)
                : `▶ ${payload.name}`;
              historyEntries.push(`\`${label}\``);
            }
            if (!isChannelProgressDraftWorkToolName(payload.name)) {
              return;
            }
            const statusLine = formatChannelProgressDraftLineForEntry(
              account.config,
              {
                event: "tool",
                name: payload.name,
                phase: payload.phase,
                args: payload.args,
              },
              {
                detailMode: payload.detailMode,
              },
            );
            if (statusLine) {
              updateStreamingStatusLine(statusLine);
            }
          }
        : undefined,
      onAssistantMessageStart: streamingEnabled
        ? () => {
            updateStreamingStatusLine("");
          }
        : undefined,
      onCompactionStart: streamingEnabled
        ? () => {
            updateStreamingStatusLine("📦 **Compacting context...**");
          }
        : undefined,
      onCompactionEnd: streamingEnabled
        ? () => {
            updateStreamingStatusLine("");
          }
        : undefined,
    },
    markDispatchIdle,
  };
}
