import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listReviewRequests } from '@/lib/repositories/reviews.repo';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Review requests already sent (MVP3 §5).
 *
 * Sits before `/reviews/[id]` because the segment is static — Next matches it
 * first. Exists so the Avis screen can tell a project whose client has been
 * asked from one that has not: without it the two looked identical, and asking
 * again was the only way to find out.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'reviews:read');

    const requests = await listReviewRequests(ctx.organizationId);

    return NextResponse.json({
      requests: requests.map((entry) => ({
        id: entry.id,
        projectId: entry.projectId,
        clientId: entry.clientId,
        status: entry.status,
        sentAt: entry.sentAt,
        expiresAt: entry.expiresAt,
      })),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
