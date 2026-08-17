import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { reviews, reviewRequests, projects, clients } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit, withOutbox } from '@/lib/webhooks';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';

export type CreateReviewRequestInput = Omit<
  typeof reviewRequests.$inferInsert,
  'id' | 'organizationId' | 'status' | 'sentAt' | 'createdAt'
>;

export async function createReviewRequest(
  organizationId: string,
  input: CreateReviewRequestInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  // Validate project and client exist
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), sql`deleted_at IS NULL`));
  if (!project) {
    throw new ApiError('VALIDATION_ERROR', 'Project not found', 400);
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId), sql`deleted_at IS NULL`));
  if (!client) {
    throw new ApiError('VALIDATION_ERROR', 'Client not found', 400);
  }

  // Delete any existing review request for the project to respect unique constraint
  await db
    .delete(reviewRequests)
    .where(and(eq(reviewRequests.projectId, input.projectId), eq(reviewRequests.organizationId, organizationId)));

  const [request] = await db
    .insert(reviewRequests)
    .values({
      ...input,
      organizationId,
      status: 'pending',
      sentAt: new Date(),
      createdBy: actorUserId || null,
    })
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'review_request.created',
    targetType: 'review_request',
    targetId: request.id,
    ipAddress,
  });

  // MVP3 §6 names this event `review.requested`; it is what n8n listens on to
  // email the client their review link (MVP5 §3.2).
  try {
    const payload = await buildEventPayload({
      organizationId,
      entityKind: 'review_request',
      entityId: request.id,
      entity: { ...request, clientId: input.clientId },
      withPortalUrl: true,
    });
    await emit('review.requested', organizationId, payload);
  } catch (emitErr) {
    console.error('Failed to emit review.requested:', emitErr);
  }

  return request;
}

export async function submitReview(
  organizationId: string,
  requestId: string,
  input: {
    rating: number;
    comment?: string | null;
    submittedByName: string;
    submittedByEmail: string;
    isPublic?: boolean;
  },
  ipAddress?: string | null
) {
  return await withOutbox(async (tx, outbox) => {
    // 1. Get review request
    const [request] = await tx
      .select()
      .from(reviewRequests)
      .where(and(eq(reviewRequests.id, requestId), eq(reviewRequests.organizationId, organizationId)));

    if (!request) {
      throw new ApiError('NOT_FOUND', 'Review request not found', 404);
    }

    if (new Date() > new Date(request.expiresAt)) {
      throw new ApiError('VALIDATION_ERROR', 'Review request has expired', 400);
    }

    // 2. Insert review
    const [review] = await tx
      .insert(reviews)
      .values({
        organizationId,
        requestId,
        projectId: request.projectId,
        clientId: request.clientId,
        rating: input.rating,
        comment: input.comment || null,
        submittedByName: input.submittedByName,
        submittedByEmail: input.submittedByEmail,
        submittedByIp: ipAddress || null,
        isPublic: input.isPublic !== undefined ? input.isPublic : false,
        moderationStatus: 'pending',
      })
      .returning();

    // 3. Update request status to submitted
    await tx
      .update(reviewRequests)
      .set({ status: 'submitted' })
      .where(eq(reviewRequests.id, requestId));

    await createAuditLog({
      organizationId,
      actorUserId: null,
      action: 'review.submitted',
      targetType: 'review',
      targetId: review.id,
      ipAddress,
      metadata: { rating: review.rating },
    });

    await outbox.emit('review.created', organizationId, { review });

    return review;
  });
}

export async function listReviews(
  organizationId: string,
  options?: {
    projectId?: string;
    rating?: number;
    moderationStatus?: string;
    page?: number;
    limit?: number;
  }
) {
  const tdb = tenantDb(organizationId);
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (options?.projectId) {
    conditions.push(eq(reviews.projectId, options.projectId));
  }
  if (options?.rating) {
    conditions.push(eq(reviews.rating, options.rating));
  }
  if (options?.moderationStatus) {
    conditions.push(eq(reviews.moderationStatus, options.moderationStatus));
  }

  const results = await tdb
    .select(reviews, conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reviews.submittedAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function moderateReview(
  organizationId: string,
  id: string,
  moderationStatus: 'approved' | 'rejected',
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(reviews, eq(reviews.id, id));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Review not found', 404);
  }

  // tenantDb.update takes (table, values, condition) and applies the
  // organization filter itself — it is not the chainable Drizzle builder.
  const [review] = await tdb
    .update(reviews, { moderationStatus }, eq(reviews.id, id))
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: `review.moderated`,
    targetType: 'review',
    targetId: id,
    ipAddress,
    metadata: { status: moderationStatus },
  });

  await emit('review.moderated', organizationId, { review });

  return review;
}
