import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listReviews } from '@/lib/repositories/reviews.repo';
import { formatErrorResponse } from '@/lib/errors';

/** GET /api/v1/reviews — list with filters (MVP3 §5). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'reviews:read');

    const searchParams = request.nextUrl.searchParams;
    const ratingParam = searchParams.get('rating');

    const reviews = await listReviews(ctx.organizationId, {
      projectId: searchParams.get('projectId') || undefined,
      rating: ratingParam ? parseInt(ratingParam, 10) : undefined,
      moderationStatus: searchParams.get('moderationStatus') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
    });

    return NextResponse.json({ reviews });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
