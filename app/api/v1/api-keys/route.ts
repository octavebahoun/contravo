import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { generateApiKey } from '@/lib/api-keys';
import { assertQuota, recomputeQuotaUsage } from '@/lib/billing/quotas.service';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expiresAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((val) => (val ? new Date(val) : null)),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'api_keys:read');

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        lastUsedIp: apiKeys.lastUsedIp,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.organizationId, ctx.organizationId),
          isNull(apiKeys.revokedAt)
        )
      );

    return NextResponse.json({ apiKeys: keys });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'api_keys:write');

    const body = await request.json();
    const result = createKeySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { name, scopes, expiresAt } = result.data;

    await assertQuota(ctx.organizationId, 'maxApiKeys');

    const apiKey = await generateApiKey({
      name,
      organizationId: ctx.organizationId,
      scopes,
      expiresAt: expiresAt || null,
      createdBy: ctx.userId || null,
    });

    await recomputeQuotaUsage(ctx.organizationId);

    return NextResponse.json(apiKey, { status: 201 });
  } catch (err: any) {
    // `status` covers QuotaExceededError, which carries no `statusCode`.
    const status = err?.statusCode || err?.status || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}
