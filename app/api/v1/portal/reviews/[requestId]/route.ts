import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { consumePublicToken } from '@/lib/public-tokens';
import { emit } from '@/lib/webhooks';
import { z } from 'zod';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const ctx = await getApiContext();

    if (ctx.authType !== 'public_token') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Only public token access allowed' },
        { status: 403 }
      );
    }

    if (!ctx.scopes.includes('read') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: read' },
        { status: 403 }
      );
    }

    const { requestId } = await params;

    // Return mock review request details
    return NextResponse.json({
      reviewRequest: {
        id: requestId,
        organizationId: ctx.organizationId,
        title: 'Project Feedback Review',
        status: 'pending',
        recipientEmail: ctx.recipientEmail,
        createdAt: new Date().toISOString(),
      },
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const ctx = await getApiContext();

    if (ctx.authType !== 'public_token') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Only public token access allowed' },
        { status: 403 }
      );
    }

    if (!ctx.scopes.includes('submit_review') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: submit_review' },
        { status: 403 }
      );
    }

    const { requestId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = reviewSchema.safeParse(body);

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

    const { rating, comment } = result.data;

    // Consume token
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    await consumePublicToken(ctx.publicTokenId!, ip);

    // Emit event to webhook endpoints
    await emit('review.submitted', ctx.organizationId, {
      reviewRequestId: requestId,
      rating,
      comment,
      submittedBy: ctx.recipientEmail,
      submittedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Review submitted successfully',
      submittedAt: new Date().toISOString(),
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
