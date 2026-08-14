import { Redis } from '@upstash/redis';

/**
 * Shared Upstash Redis client for n8n idempotency and other distributed concerns.
 * Falls back to null (in-memory behavior expected at call sites) when env vars
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured.
 */
let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/** Visibility window (seconds) for already-seen n8n event ids. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Records an event id as seen and reports whether it was already present.
 *
 * Used to guarantee end-to-end idempotency for Excellence → n8n webhook events:
 * replaying the same `event.id` (MVP5 §6) must produce a single side effect.
 *
 * @param eventId - The unique event identifier from the webhook payload.
 * @returns `true` if the event was already seen (duplicate), `false` if it is new.
 * @throws Never rejects; on Redis failure the event is treated as new (`false`)
 *         and the error is logged so delivery is never blocked.
 *
 * @example
 * if (await isDuplicateEvent(eventId)) {
 *   return new NextResponse(null, { status: 200 });
 * }
 */
export async function isDuplicateEvent(eventId: string): Promise<boolean> {
  if (!redis) return false;
  try {
    const key = `n8n:idempotency:${eventId}`;
    const result = await redis.set(key, '1', { nx: true, ex: IDEMPOTENCY_TTL_SECONDS });
    // set() with nx returns 'OK' when set, null when key already existed.
    return result === null;
  } catch (error) {
    console.error('[idempotency] Redis check failed, allowing event through:', error);
    return false;
  }
}

/**
 * Marks an event id as seen without checking prior state.
 * Useful for recording events after successful processing.
 *
 * @param eventId - The unique event identifier from the webhook payload.
 */
export async function markEventSeen(eventId: string): Promise<void> {
  if (!redis) return;
  try {
    const key = `n8n:idempotency:${eventId}`;
    await redis.set(key, '1', { ex: IDEMPOTENCY_TTL_SECONDS });
  } catch (error) {
    console.error('[idempotency] Redis mark failed:', error);
  }
}
