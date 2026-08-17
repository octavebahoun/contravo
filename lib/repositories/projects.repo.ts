import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { projects, projectMembers, invoices } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit, withOutbox } from '@/lib/webhooks';
import { getNextSequenceNumber } from './sequences.repo';

export type CreateProjectInput = Omit<
  typeof projects.$inferInsert,
  'id' | 'organizationId' | 'code' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export type UpdateProjectInput = Partial<CreateProjectInput>;

export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await withOutbox(async (tx, outbox) => {
    const currentYear = new Date().getFullYear();
    const code = await getNextSequenceNumber(tx, organizationId, 'project', currentYear);

    const [project] = await tx
      .insert(projects)
      .values({
        ...input,
        organizationId,
        code,
        createdBy: actorUserId || null,
      })
      .returning();

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      ipAddress,
      metadata: { code, name: project.name },
    });

    await outbox.emit('project.created', organizationId, { project });

    return project;
  });
}

export async function getProjectById(organizationId: string, id: string) {
  const tdb = tenantDb(organizationId);
  const results = await tdb.select(projects, and(
    eq(projects.id, id),
    sql`deleted_at IS NULL`
  ));
  return results[0] || null;
}

export async function listProjects(
  organizationId: string,
  options?: {
    clientId?: string;
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

  if (options?.clientId) {
    conditions.push(eq(projects.clientId, options.clientId));
  }

  if (options?.status) {
    conditions.push(eq(projects.status, options.status));
  }

  const results = await tdb.select(projects, and(...conditions))
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateProject(
  organizationId: string,
  id: string,
  input: UpdateProjectInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb.select(projects, and(
    eq(projects.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Project not found', 404);
  }

  const [project] = (await tdb.update(
    projects,
    {
      ...input,
      updatedAt: new Date(),
    },
    eq(projects.id, id)
  ).returning()) as any;

  const statusChanged = input.status !== undefined && input.status !== existing.status;

  if (statusChanged) {
    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'project.status_changed',
      targetType: 'project',
      targetId: id,
      ipAddress,
      metadata: { from: existing.status, to: project.status },
    });

    await emit('project.status_changed', organizationId, {
      project,
      from: existing.status,
      to: project.status,
    });

    if (project.status === 'delivered') {
      await emit('project.delivered', organizationId, { project });
    }
  } else {
    const changed: string[] = [];
    for (const key of Object.keys(input)) {
      if ((input as any)[key] !== (existing as any)[key]) {
        changed.push(key);
      }
    }

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'project.updated',
      targetType: 'project',
      targetId: id,
      ipAddress,
      metadata: { changed },
    });

    await emit('project.updated', organizationId, { project, changed });
  }

  return project;
}

export async function deleteProject(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  // 1. Check if project exists
  const [project] = await tdb.select(projects, and(
    eq(projects.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!project) {
    throw new ApiError('NOT_FOUND', 'Project not found', 404);
  }

  // 2. Project repository : bloquer la suppression si le projet a des factures non-draft (status != 'draft')
  const activeInvoices = await tdb.select(
    invoices,
    and(
      eq(invoices.projectId, id),
      sql`deleted_at IS NULL`,
      sql`status != 'draft'`
    )
  );

  if (activeInvoices.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cannot delete project with non-draft invoices',
      400,
      { activeInvoicesCount: activeInvoices.length }
    );
  }

  // 3. Perform soft delete
  const [deletedProject] = (await tdb.update(
    projects,
    {
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
    eq(projects.id, id)
  ).returning()) as any;

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'project.deleted',
    targetType: 'project',
    targetId: id,
    ipAddress,
  });

  return deletedProject;
}

export async function addProjectMember(
  organizationId: string,
  projectId: string,
  userId: string,
  role: 'lead' | 'contributor' | 'observer',
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  // Check project existence
  const [project] = await tdb.select(projects, and(
    eq(projects.id, projectId),
    sql`deleted_at IS NULL`
  ));

  if (!project) {
    throw new ApiError('NOT_FOUND', 'Project not found', 404);
  }

  const [member] = (await tdb.insert(projectMembers, {
    projectId,
    userId,
    role,
  }).returning()) as any;

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'project.member_added',
    targetType: 'project',
    targetId: projectId,
    ipAddress,
    metadata: { userId, role },
  });

  return member;
}

export async function removeProjectMember(
  organizationId: string,
  projectId: string,
  userId: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const result = await tdb.delete(
    projectMembers,
    and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId)
    )
  );

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'project.member_removed',
    targetType: 'project',
    targetId: projectId,
    ipAddress,
    metadata: { userId },
  });

  return result;
}

export async function getProjectMembers(organizationId: string, projectId: string) {
  const tdb = tenantDb(organizationId);
  return await tdb.select(
    projectMembers,
    eq(projectMembers.projectId, projectId)
  );
}
