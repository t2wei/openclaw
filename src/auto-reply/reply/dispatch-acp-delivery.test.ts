import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAcpDispatchDeliveryCoordinator } from "./dispatch-acp-delivery.js";
import type { ReplyDispatcher } from "./reply-dispatcher.js";
import { buildTestCtx } from "./test-ctx.js";
import { createAcpTestConfig } from "./test-fixtures/acp-runtime.js";

const ttsMocks = vi.hoisted(() => ({
  maybeApplyTtsToPayload: vi.fn(async (paramsUnknown: unknown) => {
    const params = paramsUnknown as { payload: unknown };
    return params.payload;
  }),
}));

const routeMocks = vi.hoisted(() => ({
  routeReply: vi.fn(async (_params: unknown) => ({ ok: true as const, messageId: "mock" })),
}));

vi.mock("../../tts/tts.js", () => ({
  maybeApplyTtsToPayload: (params: unknown) => ttsMocks.maybeApplyTtsToPayload(params),
}));

vi.mock("./route-reply.js", () => ({
  routeReply: (params: unknown) => routeMocks.routeReply(params),
}));

vi.mock("../../infra/outbound/message-action-runner.js", () => ({
  runMessageAction: vi.fn(async () => ({ ok: true as const })),
}));

function createDispatcher(): ReplyDispatcher {
  return {
    sendToolResult: vi.fn(() => true),
    sendBlockReply: vi.fn(() => true),
    sendFinalReply: vi.fn(() => true),
    waitForIdle: vi.fn(async () => {}),
    getQueuedCounts: vi.fn(() => ({ tool: 0, block: 0, final: 0 })),
    markComplete: vi.fn(),
  };
}

function createCoordinator(onReplyStart?: (...args: unknown[]) => Promise<void>) {
  return createAcpDispatchDeliveryCoordinator({
    cfg: createAcpTestConfig(),
    ctx: buildTestCtx({
      Provider: "discord",
      Surface: "discord",
      SessionKey: "agent:codex-acp:session-1",
    }),
    dispatcher: createDispatcher(),
    inboundAudio: false,
    shouldRouteToOriginating: false,
    ...(onReplyStart ? { onReplyStart } : {}),
  });
}

describe("createAcpDispatchDeliveryCoordinator", () => {
  it("starts reply lifecycle only once when called directly and through deliver", async () => {
    const onReplyStart = vi.fn(async () => {});
    const coordinator = createCoordinator(onReplyStart);

    await coordinator.startReplyLifecycle();
    await coordinator.deliver("final", { text: "hello" });
    await coordinator.startReplyLifecycle();
    await coordinator.deliver("block", { text: "world" });

    expect(onReplyStart).toHaveBeenCalledTimes(1);
  });

  it("starts reply lifecycle once when deliver triggers first", async () => {
    const onReplyStart = vi.fn(async () => {});
    const coordinator = createCoordinator(onReplyStart);

    await coordinator.deliver("final", { text: "hello" });
    await coordinator.startReplyLifecycle();

    expect(onReplyStart).toHaveBeenCalledTimes(1);
  });

  it("does not start reply lifecycle for empty payload delivery", async () => {
    const onReplyStart = vi.fn(async () => {});
    const coordinator = createCoordinator(onReplyStart);

    await coordinator.deliver("final", {});

    expect(onReplyStart).not.toHaveBeenCalled();
  });
});

describe("replyRouting config", () => {
  beforeEach(() => {
    routeMocks.routeReply.mockReset();
    routeMocks.routeReply.mockResolvedValue({ ok: true as const, messageId: "mock" });
  });

  it("delivers via dispatcher when replyRouting is 'dispatcher' even with shouldRouteToOriginating", async () => {
    const dispatcher = createDispatcher();
    const coordinator = createAcpDispatchDeliveryCoordinator({
      cfg: createAcpTestConfig({
        acp: { enabled: true, stream: { replyRouting: "dispatcher" } },
      }),
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        SessionKey: "agent:codex-acp:session-1",
      }),
      dispatcher,
      inboundAudio: false,
      shouldRouteToOriginating: true,
      originatingChannel: "feishu",
      originatingTo: "chat:group-1",
    });

    await coordinator.deliver("final", { text: "hello" });

    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello" }),
    );
    expect(routeMocks.routeReply).not.toHaveBeenCalled();
  });

  it("delivers blocks via dispatcher in dispatcher mode", async () => {
    const dispatcher = createDispatcher();
    const coordinator = createAcpDispatchDeliveryCoordinator({
      cfg: createAcpTestConfig({
        acp: { enabled: true, stream: { replyRouting: "dispatcher" } },
      }),
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        SessionKey: "agent:codex-acp:session-1",
      }),
      dispatcher,
      inboundAudio: false,
      shouldRouteToOriginating: true,
      originatingChannel: "feishu",
      originatingTo: "chat:group-1",
    });

    await coordinator.deliver("block", { text: "chunk" });

    expect(dispatcher.sendBlockReply).toHaveBeenCalled();
    expect(routeMocks.routeReply).not.toHaveBeenCalled();
    expect(coordinator.getAccumulatedBlockText()).toBe("chunk");
  });

  it("suppresses all delivery when replyRouting is 'silent'", async () => {
    const dispatcher = createDispatcher();
    const coordinator = createAcpDispatchDeliveryCoordinator({
      cfg: createAcpTestConfig({
        acp: { enabled: true, stream: { replyRouting: "silent" } },
      }),
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        SessionKey: "agent:codex-acp:session-1",
      }),
      dispatcher,
      inboundAudio: false,
      shouldRouteToOriginating: false,
    });

    const result = await coordinator.deliver("block", { text: "invisible" });

    expect(result).toBe(true);
    expect(dispatcher.sendBlockReply).not.toHaveBeenCalled();
    expect(routeMocks.routeReply).not.toHaveBeenCalled();
    expect(coordinator.getAccumulatedBlockText()).toBe("invisible");
    expect(coordinator.getRoutedCounts().block).toBe(1);
  });

  it("skips TTS processing in silent mode", async () => {
    ttsMocks.maybeApplyTtsToPayload.mockClear();
    const dispatcher = createDispatcher();
    const coordinator = createAcpDispatchDeliveryCoordinator({
      cfg: createAcpTestConfig({
        acp: { enabled: true, stream: { replyRouting: "silent" } },
      }),
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        SessionKey: "agent:codex-acp:session-1",
      }),
      dispatcher,
      inboundAudio: false,
      shouldRouteToOriginating: false,
    });

    await coordinator.deliver("final", { text: "silent" });

    expect(ttsMocks.maybeApplyTtsToPayload).not.toHaveBeenCalled();
  });

  it("uses route path by default (replyRouting unset)", async () => {
    const dispatcher = createDispatcher();
    const coordinator = createAcpDispatchDeliveryCoordinator({
      cfg: createAcpTestConfig(),
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        SessionKey: "agent:codex-acp:session-1",
      }),
      dispatcher,
      inboundAudio: false,
      shouldRouteToOriginating: true,
      originatingChannel: "feishu",
      originatingTo: "chat:group-1",
    });

    await coordinator.deliver("final", { text: "routed" });

    expect(routeMocks.routeReply).toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
  });
});
