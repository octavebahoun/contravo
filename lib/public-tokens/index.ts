import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { publicTokens } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { tenantDb } from '@/lib/db/tenant-db';
import { generateBase62, hashSecret } from '../api-keys';

export type GeneratePublicTokenParams = {
  organizationId: string;
  resourceType: 'quote' | 'contract' | 'invoice' | 'deliverable' | 'review_request';
  resourceId: string;
  recipientEmail: string;
  actions: string[];
  expiresInDays?: number;
  maxUses?: number | null;
  createdBy?: string | null;
};

export type GeneratePublicTokenResult = {
  id: string;
  token: string;
  recipientEmail: string;
  actions: string[];
  expiresAt: Date;
  resourceType: string;
  resourceId: string;
};

export async function generatePublicToken(
  params: GeneratePublicTokenParams
): Promise<GeneratePublicTokenResult> {
  const randomPart = generateBase62(40);
  const token = `pt_${randomPart}`;
  const tokenHash = hashSecret(token);

  // Expiration logic as per specs
  let durationDays = params.expiresInDays;
  if (!durationDays) {
    if (params.actions.includes('sign')) {
      durationDays = 7;
    } else if (params.resourceType === 'invoice') {
      durationDays = 90;
    } else if (params.resourceType === 'review_request') {
      durationDays = 60;
    } else {
      durationDays = 30;
    }
  }
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  // Max uses default logic
  let maxUses = params.maxUses;
  if (maxUses === undefined) {
    if (params.actions.includes('sign') || params.actions.includes('approve') || params.actions.includes('reject') || params.actions.includes('submit_review')) {
      maxUses = 1;
    } else {
      maxUses = null; // Unlimited read
    }
  }

  const [pt] = await db
    .insert(publicTokens)
    .values({
      organizationId: params.organizationId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      tokenHash,
      actions: params.actions,
      recipientEmail: params.recipientEmail,
      expiresAt,
      maxUses,
      createdBy: params.createdBy || null,
    })
    .returning();

  return {
    id: pt.id,
    token,
    recipientEmail: pt.recipientEmail,
    actions: pt.actions,
    expiresAt: pt.expiresAt,
    resourceType: pt.resourceType,
    resourceId: pt.resourceId,
  };
}

export type VerifiedPublicTokenContext = {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  actions: string[];
  recipientEmail: string;
  db: ReturnType<typeof tenantDb>;
};

export async function verifyPublicToken(
  token: string,
  resourceType: string,
  resourceId: string
): Promise<VerifiedPublicTokenContext> {
  if (!token) {
    throw new ApiError('UNAUTHENTICATED', 'Public token is required', 401);
  }

  const tokenHash = hashSecret(token);

  // Check if token exists
  const tokens = await db
    .select()
    .from(publicTokens)
    .where(eq(publicTokens.tokenHash, tokenHash))
    .limit(1);

  if (tokens.length === 0) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid public token', 401);
  }

  const pt = tokens[0];

  if (pt.revokedAt) {
    throw new ApiError('TOKEN_REVOKED', 'Public token has been revoked', 401);
  }

  if (pt.expiresAt < new Date()) {
    throw new ApiError('TOKEN_EXPIRED', 'Public token has expired', 401);
  }

  if (pt.maxUses !== null && pt.usedCount >= pt.maxUses) {
    throw new ApiError('TOKEN_EXHAUSTED', 'Public token usage limit reached', 403);
  }

  if (pt.resourceType !== resourceType || pt.resourceId !== resourceId) {
    throw new ApiError('IDENTITY_MISMATCH', 'Token is not valid for this resource', 403);
  }

  return {
    id: pt.id,
    organizationId: pt.organizationId,
    resourceType: pt.resourceType,
    resourceId: pt.resourceId,
    actions: pt.actions,
    recipientEmail: pt.recipientEmail,
    db: tenantDb(pt.organizationId),
  };
}

export async function consumePublicToken(
  tokenId: string,
  ipAddress?: string
): Promise<void> {
  const clientIp = ipAddress || null;

  await db.transaction(async (tx) => {
    // Lock the row
    const [pt] = await tx
      .select()
      .from(publicTokens)
      .where(eq(publicTokens.id, tokenId))
      .limit(1)
      .for('update');

    if (!pt) {
      throw new ApiError('NOT_FOUND', 'Public token not found', 404);
    }

    if (pt.maxUses !== null && pt.usedCount >= pt.maxUses) {
      throw new ApiError('TOKEN_EXHAUSTED', 'Public token usage limit reached', 403);
    }

    const now = new Date();
    await tx
      .update(publicTokens)
      .set({
        usedCount: pt.usedCount + 1,
        firstUsedAt: pt.firstUsedAt || now,
        lastUsedAt: now,
        lastUsedIp: clientIp,
      })
      .where(eq(publicTokens.id, tokenId));
  });
}

export async function revokePublicToken(id: string, organizationId: string): Promise<void> {
  const result = await db
    .update(publicTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(publicTokens.id, id),
        eq(publicTokens.organizationId, organizationId)
      )
    )
    .returning({ id: publicTokens.id });

  if (result.length === 0) {
    throw new ApiError('NOT_FOUND', 'Public token not found or already revoked', 404);
  }
}
