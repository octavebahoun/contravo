import { eq, and, sql, desc, or } from 'drizzle-orm';
import { tenantDb } from '@/lib/db/tenant-db';
import { clients, projects, invoices } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';

export type CreateClientInput = Omit<
  typeof clients.$inferInsert,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export type UpdateClientInput = Partial<CreateClientInput>;

export async function createClient(
  organizationId: string,
  input: CreateClientInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [client] = await tdb.insert(clients, {
    ...input,
    createdBy: actorUserId || null,
  }).returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'client.created',
    targetType: 'client',
    targetId: client.id,
    ipAddress,
    metadata: { displayName: client.displayName },
  });

  await emit('client.created', organizationId, { client });

  return client;
}

export async function getClientById(organizationId: string, id: string) {
  const tdb = tenantDb(organizationId);
  const results = await tdb.select(clients, and(
    eq(clients.id, id),
    sql`deleted_at IS NULL`
  ));
  return results[0] || null;
}

export async function listClients(
  organizationId: string,
  options?: {
    search?: string;
    isArchived?: boolean;
    page?: number;
    limit?: number;
  }
) {
  const tdb = tenantDb(organizationId);
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [sql`deleted_at IS NULL`];

  if (options?.isArchived !== undefined) {
    conditions.push(eq(clients.isArchived, options.isArchived));
  }

  if (options?.search) {
    // Basic search on displayName and email
    const searchPattern = `%${options.search}%`;
    conditions.push(
      or(
        sql`${clients.displayName} ILIKE ${searchPattern}`,
        sql`${clients.email} ILIKE ${searchPattern}`
      ) as any
    );
  }

  const results = await tdb.select(clients, and(...conditions))
    .orderBy(desc(clients.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateClient(
  organizationId: string,
  id: string,
  input: UpdateClientInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb.select(clients, and(
    eq(clients.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Client not found', 404);
  }

  const [client] = await tdb.update(
    clients,
    {
      ...input,
      updatedAt: new Date(),
    },
    eq(clients.id, id)
  ).returning();

  const changed: string[] = [];
  for (const key of Object.keys(input)) {
    if ((input as any)[key] !== (existing as any)[key]) {
      changed.push(key);
    }
  }

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'client.updated',
    targetType: 'client',
    targetId: client.id,
    ipAddress,
    metadata: { changed },
  });

  await emit('client.updated', organizationId, { client, changed });

  return client;
}

export async function deleteClient(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  // 1. Check if client exists
  const [client] = await tdb.select(clients, and(
    eq(clients.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!client) {
    throw new ApiError('NOT_FOUND', 'Client not found', 404);
  }

  // 2. Client repository: bloquer la suppression logique si le client a des projets actifs 
  // (status NOT IN ('cancelled', 'archived', 'delivered'))
  const activeProjects = await tdb.select(
    projects,
    and(
      eq(projects.clientId, id),
      sql`deleted_at IS NULL`,
      sql`status NOT IN ('cancelled', 'archived', 'delivered')`
    )
  );

  if (activeProjects.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cannot delete client with active projects',
      400,
      { activeProjectsCount: activeProjects.length }
    );
  }

  // ou des factures non payées (status NOT IN ('paid', 'cancelled', 'refunded'))
  const unpaidInvoices = await tdb.select(
    invoices,
    and(
      eq(invoices.clientId, id),
      sql`deleted_at IS NULL`,
      sql`status NOT IN ('paid', 'cancelled', 'refunded')`
    )
  );

  if (unpaidInvoices.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cannot delete client with unpaid invoices',
      400,
      { unpaidInvoicesCount: unpaidInvoices.length }
    );
  }

  // 3. Perform soft delete
  const [deletedClient] = await tdb.update(
    clients,
    {
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
    eq(clients.id, id)
  ).returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'client.deleted',
    targetType: 'client',
    targetId: id,
    ipAddress,
  });

  await emit('client.deleted', organizationId, { client: deletedClient });

  return deletedClient;
}

export async function archiveClient(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb.select(clients, and(
    eq(clients.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Client not found', 404);
  }

  const [client] = await tdb.update(
    clients,
    {
      isArchived: true,
      updatedAt: new Date(),
    },
    eq(clients.id, id)
  ).returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'client.archived',
    targetType: 'client',
    targetId: id,
    ipAddress,
  });

  await emit('client.archived', organizationId, { client });

  return client;
}

export async function unarchiveClient(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb.select(clients, and(
    eq(clients.id, id),
    sql`deleted_at IS NULL`
  ));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Client not found', 404);
  }

  const [client] = await tdb.update(
    clients,
    {
      isArchived: false,
      updatedAt: new Date(),
    },
    eq(clients.id, id)
  ).returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'client.unarchived',
    targetType: 'client',
    targetId: id,
    ipAddress,
  });

  await emit('client.unarchived', organizationId, { client });

  return client;
}
