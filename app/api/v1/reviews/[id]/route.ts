import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listReviews, moderateReview } from '@/lib/repositories/reviews.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

/** Single review endpoints (MVP3 §5). */

const moderateSchema = z.object({
  moderationStatus: z.enum(['approved', 'rejected']),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'reviews:read');

    const { id } = await params;
    // The repository exposes no by-id getter; filter the tenant-scoped list.
    const reviews = await listReviews(ctx.organizationId, { limit: 1000 });
    const review = (reviews as Array<{ id: string }>).find((r) => r.id === id);

    if (!review) {
      throw new ApiError('NOT_FOUND', 'Review not found', 404);
    }

    return NextResponse.json(review);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

/** Moderation only — review content itself is immutable (MVP3 §5). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'reviews:write');

    const { id } = await params;
    const body = await request.json();
    const { moderationStatus } = moderateSchema.parse(body);

    const review = await moderateReview(
      ctx.organizationId,
      id,
      moderationStatus,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(review);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
