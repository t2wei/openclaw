// Tests scope-context loading (group/topic/sender), miss-safe behavior, caps, and gating.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import * as globals from "../../globals.js";
import { buildScopeContextBlock, shouldApplyScopeContext } from "./scope-context.js";

const tmpDirs: string[] = [];

const CHAT_ID = "oc_group1";
const TOPIC_SCOPE = "omt_topic1";
const SENDER_OPEN_ID = "ou_sender1";
const SENDER_USER_ID = "76aeadf9";

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-scope-context-"));
  tmpDirs.push(dir);
  await fs.mkdir(path.join(dir, "memory"), { recursive: true });
  return dir;
}

async function writeFile(workspaceDir: string, relativePath: string, content: string) {
  const absolutePath = path.join(workspaceDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf-8");
}

async function writeOpenIdIndex(workspaceDir: string, entries: Record<string, string>) {
  await writeFile(workspaceDir, "memory/people/_openid-index.json", JSON.stringify({ entries }));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("shouldApplyScopeContext", () => {
  const reset = (applyOn?: Array<"every" | "first">, enabled?: boolean) =>
    ({ agents: { defaults: { scopeContext: { applyOn, enabled } } } }) as OpenClawConfig;

  it("defaults to applying every turn when unset", () => {
    expect(shouldApplyScopeContext({ cfg: undefined, isBareSessionReset: false })).toBe(true);
    expect(shouldApplyScopeContext({ cfg: reset(), isBareSessionReset: false })).toBe(true);
  });

  it("respects enabled:false", () => {
    expect(
      shouldApplyScopeContext({ cfg: reset(undefined, false), isBareSessionReset: true }),
    ).toBe(false);
  });

  it("applies every-turn when applyOn includes 'every'", () => {
    expect(shouldApplyScopeContext({ cfg: reset(["every"]), isBareSessionReset: false })).toBe(
      true,
    );
  });

  it("with applyOn:['first'] applies only on bare session reset", () => {
    expect(shouldApplyScopeContext({ cfg: reset(["first"]), isBareSessionReset: false })).toBe(
      false,
    );
    expect(shouldApplyScopeContext({ cfg: reset(["first"]), isBareSessionReset: true })).toBe(true);
  });
});

describe("buildScopeContextBlock", () => {
  it("returns null when no scope files exist (miss-safe, no throw)", async () => {
    const workspaceDir = await makeWorkspace();
    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { chatId: CHAT_ID, topicScope: TOPIC_SCOPE, senderId: SENDER_OPEN_ID },
    });
    expect(block).toBeNull();
  });

  it("loads group context only", async () => {
    const workspaceDir = await makeWorkspace();
    await writeFile(workspaceDir, `memory/groups/${CHAT_ID}/context.md`, "group background");

    const block = await buildScopeContextBlock({ workspaceDir, scope: { chatId: CHAT_ID } });

    expect(block).toContain("## Conversation Scope Context");
    expect(block).toContain(`[Untrusted scope context: memory/groups/${CHAT_ID}/context.md]`);
    expect(block).toContain("BEGIN_QUOTED_NOTES");
    expect(block).toContain("group background");
    expect(block).not.toContain("/topics/");
  });

  it("loads group + topic context", async () => {
    const workspaceDir = await makeWorkspace();
    await writeFile(workspaceDir, `memory/groups/${CHAT_ID}/context.md`, "group background");
    await writeFile(
      workspaceDir,
      `memory/groups/${CHAT_ID}/topics/${TOPIC_SCOPE}.md`,
      "topic background",
    );

    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { chatId: CHAT_ID, topicScope: TOPIC_SCOPE },
    });

    expect(block).toContain("group background");
    expect(block).toContain(
      `[Untrusted scope context: memory/groups/${CHAT_ID}/topics/${TOPIC_SCOPE}.md]`,
    );
    expect(block).toContain("topic background");
  });

  it("resolves sender open_id -> user_id via the index and loads people file", async () => {
    const workspaceDir = await makeWorkspace();
    await writeOpenIdIndex(workspaceDir, { [SENDER_OPEN_ID]: SENDER_USER_ID });
    await writeFile(
      workspaceDir,
      `memory/people/${SENDER_USER_ID}.md`,
      "sender relationship notes",
    );

    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { senderId: SENDER_OPEN_ID },
    });

    expect(block).toContain(`[Untrusted scope context: memory/people/${SENDER_USER_ID}.md]`);
    expect(block).toContain("sender relationship notes");
  });

  it("skips people segment when openid index is missing", async () => {
    const workspaceDir = await makeWorkspace();
    await writeFile(workspaceDir, `memory/groups/${CHAT_ID}/context.md`, "group background");
    // people file present but no index -> cannot resolve open_id -> skip
    await writeFile(workspaceDir, `memory/people/${SENDER_USER_ID}.md`, "should not load");

    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { chatId: CHAT_ID, senderId: SENDER_OPEN_ID },
    });

    expect(block).toContain("group background");
    expect(block).not.toContain("should not load");
  });

  it("skips people segment when sender not in index", async () => {
    const workspaceDir = await makeWorkspace();
    await writeOpenIdIndex(workspaceDir, { ou_other: "deadbeef" });
    await writeFile(workspaceDir, `memory/people/${SENDER_USER_ID}.md`, "should not load");

    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { senderId: SENDER_OPEN_ID },
    });

    expect(block).toBeNull();
  });

  it("degrades on a malformed openid index (no throw)", async () => {
    const workspaceDir = await makeWorkspace();
    // Suppress verbose log noise; the meaningful behavior is graceful degradation.
    vi.spyOn(globals, "logVerbose").mockImplementation(() => {});
    await writeFile(workspaceDir, "memory/people/_openid-index.json", "{not valid json");
    await writeFile(workspaceDir, `memory/people/${SENDER_USER_ID}.md`, "should not load");

    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { senderId: SENDER_OPEN_ID },
    });

    expect(block).toBeNull();
  });

  it("rejects path-escaping scope segments", async () => {
    const workspaceDir = await makeWorkspace();
    const block = await buildScopeContextBlock({
      workspaceDir,
      scope: { chatId: "../../etc", topicScope: "..", senderId: "ou_x/y" },
    });
    expect(block).toBeNull();
  });

  it("truncates per-file content beyond maxFileChars", async () => {
    const workspaceDir = await makeWorkspace();
    await writeFile(workspaceDir, `memory/groups/${CHAT_ID}/context.md`, "x".repeat(5000));

    const block = await buildScopeContextBlock({
      workspaceDir,
      cfg: { agents: { defaults: { scopeContext: { maxFileChars: 100 } } } } as OpenClawConfig,
      scope: { chatId: CHAT_ID },
    });

    expect(block).toContain("...[truncated]...");
  });

  it("enforces the total cap across segments", async () => {
    const workspaceDir = await makeWorkspace();
    // Large per-file cap so each file passes individually, small total cap so the
    // first block consumes the budget and the second is dropped with a sentinel.
    await writeFile(workspaceDir, `memory/groups/${CHAT_ID}/context.md`, "g".repeat(1500));
    await writeFile(
      workspaceDir,
      `memory/groups/${CHAT_ID}/topics/${TOPIC_SCOPE}.md`,
      "t".repeat(1500),
    );

    const block = await buildScopeContextBlock({
      workspaceDir,
      cfg: {
        agents: { defaults: { scopeContext: { maxFileChars: 2000, maxTotalChars: 1200 } } },
      } as OpenClawConfig,
      scope: { chatId: CHAT_ID, topicScope: TOPIC_SCOPE },
    });

    expect(block).not.toBeNull();
    expect(block).toContain("...[additional scope context truncated]...");
    expect(block).not.toContain("t".repeat(1500));
  });
});
