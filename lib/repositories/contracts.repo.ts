import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { contracts, clients, projects } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';
import { getNextSequenceNumber } from './sequences.repo';

export type CreateContractInput = Omit<
  typeof contracts.$inferInsert,
  | 'id'
  | 'organizationId'
  | 'number'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
>;

export type UpdateContractInput = Partial<CreateContractInput>;

export async function createContract(
  organizationId: string,
  input: CreateContractInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    // 1. Validate project and client exist
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), sql`deleted_at IS NULL`));
    if (!project) {
      throw new ApiError('VALIDATION_ERROR', 'Project not found', 400);
    }

    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId), sql`deleted_at IS NULL`));
    if (!client) {
      throw new ApiError('VALIDATION_ERROR', 'Client not found', 400);
    }

    // 2. Generate sequence number
    const currentYear = new Date().getFullYear();
    const number = await getNextSequenceNumber(tx, organizationId, 'contract', currentYear);

    // 3. Insert contract
    const [contract] = await tx
      .insert(contracts)
      .values({
        ...input,
        organizationId,
        number,
        status: input.status || 'draft',
        createdBy: actorUserId || null,
      })
      .returning();

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'contract.created',
      targetType: 'contract',
      targetId: contract.id,
      ipAddress,
      metadata: { number, title: contract.title },
    });

    await emit('contract.created', organizationId, { contract });

    return contract;
  });
}

export async function getContractById(organizationId: string, id: string) {
  const tdb = tenantDb(organizationId);
  const [contract] = await tdb
    .select(contracts, and(eq(contracts.id, id), sql`deleted_at IS NULL`));
  return contract || null;
}

export async function listContracts(
  organizationId: string,
  options?: {
    projectId?: string;
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

  if (options?.projectId) {
    conditions.push(eq(contracts.projectId, options.projectId));
  }
  if (options?.clientId) {
    conditions.push(eq(contracts.clientId, options.clientId));
  }
  if (options?.status) {
    conditions.push(eq(contracts.status, options.status));
  }

  const results = await tdb
    .select(contracts, and(...conditions))
    .orderBy(desc(contracts.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateContract(
  organizationId: string,
  id: string,
  input: UpdateContractInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(contracts, and(eq(contracts.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Contract not found', 404);
  }

  const [contract] = await tdb
    .update(contracts)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, id))
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
    action: 'contract.updated',
    targetType: 'contract',
    targetId: id,
    ipAddress,
    metadata: { changed },
  });

  await emit('contract.updated', organizationId, { contract, changed });

  return contract;
}

export async function deleteContract(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(contracts, and(eq(contracts.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Contract not found', 404);
  }

  const [deletedContract] = await tdb
    .update(contracts)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, id))
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'contract.deleted',
    targetType: 'contract',
    targetId: id,
    ipAddress,
  });

  await emit('contract.deleted', organizationId, { contract: deletedContract });

  return deletedContract;
}
