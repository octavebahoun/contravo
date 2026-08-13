import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { expenses, projects } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';

export type CreateExpenseInput = Omit<
  typeof expenses.$inferInsert,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export async function createExpense(
  organizationId: string,
  input: CreateExpenseInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  // 1. Validate project exists
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), sql`deleted_at IS NULL`));
  if (!project) {
    throw new ApiError('VALIDATION_ERROR', 'Project not found', 400);
  }

  const [expense] = await db
    .insert(expenses)
    .values({
      ...input,
      organizationId,
      createdBy: actorUserId || null,
    })
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'expense.created',
    targetType: 'expense',
    targetId: expense.id,
    ipAddress,
    metadata: { category: expense.category, amountCents: expense.amountCents.toString() },
  });

  await emit('expense.created', organizationId, { expense });

  return expense;
}

export async function getExpenseById(organizationId: string, id: string) {
  const tdb = tenantDb(organizationId);
  const [expense] = await tdb
    .select(expenses, and(eq(expenses.id, id), sql`deleted_at IS NULL`));
  return expense || null;
}

export async function listExpenses(
  organizationId: string,
  options?: {
    projectId?: string;
    category?: string;
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
    conditions.push(eq(expenses.projectId, options.projectId));
  }
  if (options?.category) {
    conditions.push(eq(expenses.category, options.category));
  }

  const results = await tdb
    .select(expenses, and(...conditions))
    .orderBy(desc(expenses.incurredOn))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateExpense(
  organizationId: string,
  id: string,
  input: UpdateExpenseInput,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(expenses, and(eq(expenses.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Expense not found', 404);
  }

  const [expense] = await tdb
    .update(expenses)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, id))
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
    action: 'expense.updated',
    targetType: 'expense',
    targetId: id,
    ipAddress,
    metadata: { changed },
  });

  await emit('expense.updated', organizationId, { expense, changed });

  return expense;
}

export async function deleteExpense(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(expenses, and(eq(expenses.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Expense not found', 404);
  }

  const [deletedExpense] = await tdb
    .update(expenses)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, id))
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'expense.deleted',
    targetType: 'expense',
    targetId: id,
    ipAddress,
  });

  await emit('expense.deleted', organizationId, { expense: deletedExpense });

  return deletedExpense;
}
