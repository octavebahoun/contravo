import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { apiKeys, organizations } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { tenantDb } from '@/lib/db/tenant-db';

// Helper to generate a base62 random string
export function generateBase62(length: number): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export type GenerateApiKeyResult = {
  id: string;
  secret: string;
  prefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
};

export async function generateApiKey(params: {
  name: string;
  organizationId: string;
  scopes: string[];
  expiresAt?: Date | null;
  createdBy?: string | null;
  mode?: 'live' | 'test';
}): Promise<GenerateApiKeyResult> {
  const mode = params.mode || 'live';
  const prefixBase = mode === 'test' ? 'sk_test_' : 'sk_live_';
  // Generate 32 bytes/characters of base62
  const randomPart = generateBase62(32);
  const secret = `${prefixBase}${randomPart}`;
  const prefix = secret.substring(0, 12);
  const keyHash = hashSecret(secret);

  const [newKey] = await db
    .insert(apiKeys)
    .values({
      organizationId: params.organizationId,
      name: params.name,
      prefix,
      keyHash,
      scopes: params.scopes,
      createdBy: params.createdBy || null,
      expiresAt: params.expiresAt || null,
    })
    .returning();

  return {
    id: newKey.id,
    secret,
    prefix: newKey.prefix,
    name: newKey.name,
    scopes: newKey.scopes,
    expiresAt: newKey.expiresAt,
    createdAt: newKey.createdAt,
  };
}

export type VerifiedApiKeyContext = {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
  db: ReturnType<typeof tenantDb>;
};

export async function verifyApiKey(
  secret: string,
  ipAddress?: string
): Promise<VerifiedApiKeyContext> {
  if (!secret) {
    throw new ApiError('UNAUTHENTICATED', 'API key is required', 401);
  }

  // 1. Extract prefix
  const prefix = secret.substring(0, 12);
  if (prefix.length < 12) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid API key format', 401);
  }

  // 2. Fetch API key from DB by prefix
  const keys = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.prefix, prefix),
        sql`${apiKeys.revokedAt} IS NULL`,
        sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > now())`
      )
    )
    .limit(1);

  if (keys.length === 0) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid or expired API key', 401);
  }

  const apiKey = keys[0];

  // 3. Compare hashes in constant time
  const secretHash = hashSecret(secret);
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(secretHash, 'hex'),
    Buffer.from(apiKey.keyHash, 'hex')
  );

  if (!isMatch) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid API key', 401);
  }

  // 4. Update last_used_at and last_used_ip asynchronously (don't block the response)
  const clientIp = ipAddress || null;
  db.update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      lastUsedIp: clientIp,
    })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch((err) => {
      console.error('Failed to update API key last_used metadata:', err);
    });

  return {
    apiKeyId: apiKey.id,
    organizationId: apiKey.organizationId,
    scopes: apiKey.scopes,
    db: tenantDb(apiKey.organizationId),
  };
}

export async function rotateApiKey(
  id: string,
  organizationId: string,
  createdBy?: string | null
): Promise<GenerateApiKeyResult> {
  // Find current API key
  const [currentKey] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!currentKey) {
    throw new ApiError('NOT_FOUND', 'API key not found', 404);
  }

  // Set old key's expiration to 24 hours from now
  const gracePeriod = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const oldExpiresAt = currentKey.expiresAt
    ? new Date(Math.min(currentKey.expiresAt.getTime(), gracePeriod.getTime()))
    : gracePeriod;

  await db
    .update(apiKeys)
    .set({
      expiresAt: oldExpiresAt,
      name: `${currentKey.name} (rotated)`,
    })
    .where(eq(apiKeys.id, id));

  // Determine mode from old key's prefix
  const mode = currentKey.prefix.startsWith('sk_test_') ? 'test' : 'live';

  // Generate new key
  return generateApiKey({
    name: currentKey.name.replace(' (rotated)', ''),
    organizationId,
    scopes: currentKey.scopes,
    expiresAt: null, // new key does not inherit old key's expiry unless desired, but rotate resets rotation
    createdBy,
    mode,
  });
}

export async function revokeApiKey(id: string, organizationId: string): Promise<void> {
  const result = await db
    .update(apiKeys)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.organizationId, organizationId)
      )
    )
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new ApiError('NOT_FOUND', 'API key not found or already revoked', 404);
  }
}
