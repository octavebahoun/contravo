import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { consumePublicToken } from '@/lib/public-tokens';
import { emit } from '@/lib/webhooks';

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

    if (!ctx.scopes.includes('approve') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: approve' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Consume the token (this increments the usedCount, enforcing max_uses limit)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    await consumePublicToken(ctx.publicTokenId!, ip);

    // Emit event to webhook endpoints
    await emit('deliverable.approved', ctx.organizationId, {
      deliverableId: id,
      approvedAt: new Date().toISOString(),
      approvedBy: ctx.recipientEmail,
    });

    return NextResponse.json({
      success: true,
      message: 'Deliverable approved successfully',
      approvedAt: new Date().toISOString(),
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
