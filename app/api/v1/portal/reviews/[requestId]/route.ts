import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { organizations, projects, reviewRequests, reviews } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { requirePortalAccess } from '@/lib/portal/portal-guard';
import { submitReview } from '@/lib/repositories/reviews.repo';
import { consumePublicToken } from '@/lib/public-tokens';
import { z } from 'zod';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  submitterName: z.string().min(1).optional(),
  submitterEmail: z.string().email().optional(),
});

/**
 * Review request as seen by the client in the portal (MVP3 §5).
 *
 * `alreadySubmitted` lets the page show the recorded rating instead of an empty
 * form when the link is reopened after answering.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const ctx = await requirePortalAccess('read');
    const { requestId } = await params;

    const [reviewRequest] = await db
      .select()
      .from(reviewRequests)
      .where(
        and(
          eq(reviewRequests.id, requestId),
          eq(reviewRequests.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (!reviewRequest) {
      throw new ApiError('NOT_FOUND', 'Review request not found', 404);
    }

    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, reviewRequest.projectId))
      .limit(1);

    const [org] = await db
      .select({ name: organizations.name, brandColor: organizations.brandColor })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);

    const [existing] = await db
      .select({ rating: reviews.rating, comment: reviews.comment })
      .from(reviews)
      .where(eq(reviews.requestId, requestId))
      .limit(1);

    const expired = new Date() > new Date(reviewRequest.expiresAt);

    return NextResponse.json({
      reviewRequest: {
        id: reviewRequest.id,
        status: reviewRequest.status,
        projectName: project?.name ?? null,
        sentAt: reviewRequest.sentAt,
        expiresAt: reviewRequest.expiresAt,
        expired,
      },
      organization: org ? { name: org.name, brandColor: org.brandColor } : null,
      recipientEmail: ctx.recipientEmail ?? null,
      alreadySubmitted: existing
        ? { rating: existing.rating, comment: existing.comment }
        : null,
      canSubmit:
        !existing &&
        !expired &&
        (ctx.scopes.includes('submit_review') || ctx.scopes.includes('*')),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

/**
 * Records the client's review (MVP3 §5).
 *
 * Persists through the repository, which also emits `review.created`; the token
 * is consumed only once the review is durably stored, so a failed attempt does
 * not burn one of the allowed uses.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const ctx = await requirePortalAccess('submit_review');
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

    const { rating, comment, submitterName, submitterEmail } = result.data;
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

    const review = await submitReview(
      ctx.organizationId,
      requestId,
      {
        rating,
        comment: comment ?? null,
        submittedByName: submitterName || ctx.recipientEmail || 'Client',
        submittedByEmail: submitterEmail || ctx.recipientEmail || '',
      },
      ip
    );

    await consumePublicToken(ctx.publicTokenId!, ip);

    return NextResponse.json({
      success: true,
      review: { id: review.id, rating: review.rating, submittedAt: review.submittedAt },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
