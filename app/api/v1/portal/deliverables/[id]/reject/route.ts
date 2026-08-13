import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { consumePublicToken } from '@/lib/public-tokens';
import { emit } from '@/lib/webhooks';
import { z } from 'zod';

const rejectSchema = z.object({
  reason: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();

    if (ctx.authType !== 'public_token') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Only public token access allowed' },
        { status: 403 }
      );
    }

    if (!ctx.scopes.includes('reject') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: reject' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = rejectSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'Invalid request body. Rejection reason is required.',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    // Consume the token (this increments the usedCount, enforcing max_uses limit)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    await consumePublicToken(ctx.publicTokenId!, ip);

    // Emit event to webhook endpoints
    await emit('deliverable.rejected', ctx.organizationId, {
      deliverableId: id,
      reason: result.data.reason,
      rejectedAt: new Date().toISOString(),
      rejectedBy: ctx.recipientEmail,
    });

    return NextResponse.json({
      success: true,
      message: 'Deliverable rejected successfully',
      rejectedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}
