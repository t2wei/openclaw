import crypto from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { applySessionStoreMigrations } from "./store-migrations.js";
import type { SessionEntry } from "./types.js";

const log = createSubsystemLogger("sessions/redis");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RedisSessionBackendOptions = {
  redisUrl: string;
  storePaths: string[];
  /** Override the default Redis key prefix (`openclaw:sessions:`). */
  keyPrefix?: string;
  /** Connection timeout in ms. Default: 5 000. */
  connectTimeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** In-process mirror keyed by storePath. */
const mirror = new Map<string, Record<string, SessionEntry>>();

let redisClient: import("ioredis").Redis | undefined;
let active = false;
let keyPrefix = "openclaw:sessions:";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redisKey(storePath: string): string {
  const hash = crypto.createHash("sha256").update(storePath).digest("hex").slice(0, 12);
  return `${keyPrefix}${hash}`;
}

function isSessionStoreRecord(v: unknown): v is Record<string, SessionEntry> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isRedisSessionBackendActive(): boolean {
  return active;
}

/**
 * Return the in-memory mirror for `storePath`, or `undefined` if not loaded.
 * The caller must `structuredClone` the result before returning to consumers.
 */
export function getRedisSessionMirror(storePath: string): Record<string, SessionEntry> | undefined {
  return mirror.get(storePath);
}

/**
 * Synchronously update the in-memory mirror and fire-and-forget write to Redis.
 * Called from `updateSessionStoreWriteCaches` after the EFS write succeeds.
 */
export function updateRedisSessionMirror(
  storePath: string,
  store: Record<string, SessionEntry>,
  serialized: string,
): void {
  // Update in-memory mirror synchronously (deep copy so mutations don't leak).
  mirror.set(storePath, structuredClone(store));

  // Async write to Redis — fire and forget.
  if (redisClient) {
    const key = redisKey(storePath);
    redisClient.set(key, serialized).catch((err) => {
      log.warn(`redis SET failed for ${key}: ${String(err)}`);
    });
  }
}

/**
 * Connect to Redis, load session data into the in-memory mirror.
 * If Redis is empty, seed from the provided `seedFromDisk` callback.
 */
export async function initRedisSessionBackend(
  opts: RedisSessionBackendOptions,
  seedFromDisk?: (
    storePath: string,
  ) => { store: Record<string, SessionEntry>; serialized: string } | undefined,
): Promise<void> {
  if (opts.keyPrefix) {
    keyPrefix = opts.keyPrefix;
  }

  const connectTimeout = opts.connectTimeoutMs ?? 5_000;

  let Redis: new (url: string, opts: Record<string, unknown>) => import("ioredis").Redis;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Redis = ((await import("ioredis")) as any).default;
  } catch (err) {
    log.warn(`ioredis not available, falling back to disk: ${String(err)}`);
    return;
  }

  try {
    const client = new Redis(opts.redisUrl, {
      lazyConnect: true,
      connectTimeout,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        // Exponential backoff capped at 30 s.
        return Math.min(times * 500, 30_000);
      },
    });

    client.on("error", (err) => {
      log.warn(`redis connection error: ${String(err)}`);
    });

    client.on("close", () => {
      log.warn("redis connection closed, mirror continues serving reads");
    });

    client.on("reconnecting", () => {
      log.warn("redis reconnecting…");
    });

    await client.connect();
    redisClient = client;
    log.warn(`connected to redis (${opts.redisUrl})`);
  } catch (err) {
    log.warn(`redis connect failed, falling back to disk: ${String(err)}`);
    return;
  }

  // Load each storePath from Redis → mirror.
  for (const storePath of opts.storePaths) {
    const key = redisKey(storePath);
    try {
      const raw = await redisClient.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isSessionStoreRecord(parsed)) {
          applySessionStoreMigrations(parsed);
          mirror.set(storePath, parsed);
          log.warn(`loaded ${Object.keys(parsed).length} sessions from redis (${key})`);
          continue;
        }
      }
    } catch (err) {
      log.warn(`redis GET failed for ${key}: ${String(err)}`);
    }

    // Redis empty or failed — seed from disk if callback provided.
    if (seedFromDisk) {
      const seed = seedFromDisk(storePath);
      if (seed) {
        mirror.set(storePath, structuredClone(seed.store));
        // Persist seed to Redis so next startup is fast.
        if (redisClient) {
          redisClient.set(key, seed.serialized).catch((err) => {
            log.warn(`redis seed SET failed for ${key}: ${String(err)}`);
          });
        }
        log.warn(`seeded redis from disk: ${Object.keys(seed.store).length} sessions (${key})`);
      }
    }
  }

  active = true;
  log.warn("redis session backend active");
}

export async function shutdownRedisSessionBackend(): Promise<void> {
  active = false;
  mirror.clear();
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // Ignore shutdown errors.
    }
    redisClient = undefined;
  }
}
