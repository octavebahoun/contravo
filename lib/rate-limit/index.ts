import { Redis } from '@upstash/redis';

// Simple in-memory fallback for development and testing when Upstash Redis is not configured
type RateLimitStoreValue = {
  count: number;
  expiresAt: number;
};
const inMemoryStore = new Map<string, RateLimitStoreValue>();

// Periodically clean up expired keys in memory
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of inMemoryStore.entries()) {
      if (value.expiresAt <= now) {
        inMemoryStore.delete(key);
      }
    }
  }, 60000).unref?.();
}

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export type RateLimitTier = 'free' | 'pro' | 'enterprise';

export const TIER_LIMITS: Record<RateLimitTier, number> = {
  free: 100,
  pro: 1000,
  enterprise: 5000,
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
};

export async function rateLimit(
  organizationId: string,
  tier: RateLimitTier = 'free'
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const now = Date.now();
  const windowSizeMs = 60000;
  const windowStart = Math.floor(now / windowSizeMs) * windowSizeMs;
  const resetTimeSeconds = Math.floor((windowStart + windowSizeMs) / 1000);

  const key = `ratelimit:${organizationId}:${windowStart}`;

  let currentCount = 0;

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, 60);
      const results = await pipeline.exec<[number, number]>();
      currentCount = results[0];
    } catch (error) {
      console.warn('Redis rate limiting error, falling back to in-memory:', error);
      currentCount = handleInMemoryLimit(key, windowSizeMs);
    }
  } else {
    currentCount = handleInMemoryLimit(key, windowSizeMs);
  }

  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount <= limit;

  return {
    allowed,
    limit,
    remaining,
    reset: resetTimeSeconds,
  };
}

function handleInMemoryLimit(key: string, windowSizeMs: number): number {
  const now = Date.now();
  const entry = inMemoryStore.get(key);

  if (entry && entry.expiresAt > now) {
    entry.count += 1;
    return entry.count;
  } else {
    const newEntry = {
      count: 1,
      expiresAt: now + windowSizeMs,
    };
    inMemoryStore.set(key, newEntry);
    return 1;
  }
}

export async function rateLimitIp(
  ip: string,
  limit: number = 500,
  windowSizeMs: number = 60000
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowSizeMs) * windowSizeMs;
  const resetTimeSeconds = Math.floor((windowStart + windowSizeMs) / 1000);
  const key = `ratelimit:ip:${ip}:${windowStart}`;

  let currentCount = 0;

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, Math.ceil(windowSizeMs / 1000));
      const results = await pipeline.exec<[number, number]>();
      currentCount = results[0];
    } catch (error) {
      console.warn('Redis IP rate limiting error, falling back to in-memory:', error);
      currentCount = handleInMemoryLimit(key, windowSizeMs);
    }
  } else {
    currentCount = handleInMemoryLimit(key, windowSizeMs);
  }

  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount <= limit;

  return {
    allowed,
    limit,
    remaining,
    reset: resetTimeSeconds,
  };
}

