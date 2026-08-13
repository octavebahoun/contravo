import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { deliverables, projects } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';

export type CreateDeliverableInput = Omit<
  typeof deliverables.$inferInsert,
  | 'id'
  | 'organizationId'
  | 'version'
  | 'submittedAt'
  | 'reviewedAt'
  | 'reviewedByName'
  | 'reviewedByEmail'
  | 'reviewedByIp'
  | 'rejectionReason'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
>;

export type UpdateDeliverableInput = Partial<
  Omit<
    typeof deliverables.$inferInsert,
    'id' | 'organizationId' | 'projectId' | 'version' | 'parentId' | 'createdAt' | 'updatedAt' | 'deletedAt'
  >
>;

export async function createDeliverable(
  organizationId: string,
  input: CreateDeliverableInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  // Validate project exists
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), sql`deleted_at IS NULL`));
  if (!project) {
    throw new ApiError('VALIDATION_ERROR', 'Project not found', 400);
  }

  const [deliverable] = await db
    .insert(deliverables)
    .values({
      ...input,
      organizationId,
      status: input.status || 'draft',
      version: 1,
      createdBy: actorUserId || null,
    })
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'deliverable.created',
    targetType: 'deliverable',
    targetId: deliverable.id,
    ipAddress,
    metadata: { title: deliverable.title },
  });

  await emit('deliverable.created', organizationId, { deliverable });

  return deliverable;
}

export async function getDeliverableById(organizationId: string, id: string) {
  const tdb = tenantDb(organizationId);
  const [deliverable] = await tdb
    .select(deliverables, and(eq(deliverables.id, id), sql`deleted_at IS NULL`));
  return deliverable || null;
}

export async function listDeliverables(
  organizationId: string,
  options?: {
    projectId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const tdb = tenantDb(organizationId);
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [sql`deleted_at IS NULL`];

  if (options?.projectId) {
    conditions.push(eq(deliverables.projectId, options.projectId));
  }
  if (options?.status) {
    conditions.push(eq(deliverables.status, options.status));
  }

  const results = await tdb
    .select(deliverables, and(...conditions))
    .orderBy(desc(deliverables.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateDeliverable(
  organizationId: string,
  id: string,
  input: UpdateDeliverableInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(deliverables, and(eq(deliverables.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
  }

  const [deliverable] = await tdb
    .update(deliverables)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, id))
    .returning();

  const changed: string[] = [];
  for (const key of Object.keys(input)) {
    if ((input as any)[key] !== (existing as any)[key]) {
      changed.push(key);
    }
  }

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'deliverable.updated',
    targetType: 'deliverable',
    targetId: id,
    ipAddress,
    metadata: { changed },
  });

  await emit('deliverable.updated', organizationId, { deliverable, changed });

  return deliverable;
}

export async function deleteDeliverable(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(deliverables, and(eq(deliverables.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
  }

  const [deletedDeliverable] = await tdb
    .update(deliverables)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, id))
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'deliverable.deleted',
    targetType: 'deliverable',
    targetId: id,
    ipAddress,
  });

  await emit('deliverable.deleted', organizationId, { deliverable: deletedDeliverable });

  return deletedDeliverable;
}

export async function resubmitDeliverable(
  organizationId: string,
  parentId: string,
  input: {
    title: string;
    description?: string | null;
    fileR2Key?: string | null;
    fileName?: string | null;
    fileSizeBytes?: bigint | null;
    fileMime?: string | null;
  },
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    // 1. Get parent deliverable
    const [parent] = await tx
      .select()
      .from(deliverables)
      .where(and(eq(deliverables.id, parentId), eq(deliverables.organizationId, organizationId), sql`deleted_at IS NULL`));

    if (!parent) {
      throw new ApiError('NOT_FOUND', 'Parent deliverable not found', 404);
    }

    if (parent.status !== 'revision_requested' && parent.status !== 'rejected') {
      throw new ApiError('VALIDATION_ERROR', 'Can only resubmit deliverables that were rejected or have revision requested', 400);
    }

    // 2. Insert new deliverable linked to parent
    const [deliverable] = await tx
      .insert(deliverables)
      .values({
        organizationId,
        projectId: parent.projectId,
        title: input.title,
        description: input.description || parent.description,
        status: 'submitted',
        fileR2Key: input.fileR2Key || null,
        fileName: input.fileName || null,
        fileSizeBytes: input.fileSizeBytes || null,
        fileMime: input.fileMime || null,
        submittedAt: new Date(),
        version: parent.version + 1,
        parentId: parent.id,
        createdBy: actorUserId || null,
      })
      .returning();

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'deliverable.resubmitted',
      targetType: 'deliverable',
      targetId: deliverable.id,
      ipAddress,
      metadata: { parentId, version: deliverable.version },
    });

    await emit('deliverable.resubmitted', organizationId, { deliverable, parentId });

    return deliverable;
  });
}
