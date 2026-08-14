import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createReviewRequest } from '@/lib/repositories/reviews.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/**
 * POST /api/v1/projects/:id/review-request (MVP3 §5).
 *
 * Creates the request and emits `review.requested`, which n8n turns into the
 * client email carrying the portal link.
 */
const createReviewRequestSchema = z.object({
  clientId: z.string().uuid(),
  expiresAt: z.string().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'reviews:write');

    const { id } = await params;
    const body = await request.json();
    const validated = createReviewRequestSchema.parse(body);

    const reviewRequest = await createReviewRequest(
      ctx.organizationId,
      {
        projectId: id,
        clientId: validated.clientId,
        ...(validated.expiresAt ? { expiresAt: new Date(validated.expiresAt) } : {}),
      } as never,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(reviewRequest, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
