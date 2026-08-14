import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { deliverables, organizations } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { requirePortalAccess } from '@/lib/portal/portal-guard';

/**
 * Deliverable as seen by the client in the portal (MVP3 §5).
 *
 * `canReview` gates the approve/reject panel: only a submitted deliverable
 * awaiting a decision can be acted on.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('read');
    const { id } = await params;

    const [deliverable] = await db
      .select()
      .from(deliverables)
      .where(
        and(
          eq(deliverables.id, id),
          eq(deliverables.organizationId, ctx.organizationId),
          isNull(deliverables.deletedAt)
        )
      )
      .limit(1);

    if (!deliverable) {
      throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
    }

    const [org] = await db
      .select({ name: organizations.name, brandColor: organizations.brandColor })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);

    return NextResponse.json({
      deliverable: {
        id: deliverable.id,
        title: deliverable.title,
        description: deliverable.description,
        status: deliverable.status,
        version: deliverable.version,
        fileName: deliverable.fileName,
        fileSizeBytes: deliverable.fileSizeBytes
          ? Number(deliverable.fileSizeBytes)
          : null,
        fileMime: deliverable.fileMime,
        submittedAt: deliverable.submittedAt,
        reviewedAt: deliverable.reviewedAt,
        rejectionReason: deliverable.rejectionReason,
      },
      organization: org ? { name: org.name, brandColor: org.brandColor } : null,
      recipientEmail: ctx.recipientEmail ?? null,
      canReview:
        deliverable.status === 'submitted' &&
        (ctx.scopes.includes('approve') ||
          ctx.scopes.includes('reject') ||
          ctx.scopes.includes('*')),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
