import { eq, and, sql, desc, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { quotes, quoteItems, clients, projects } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';
import { getNextSequenceNumber } from './sequences.repo';

export type CreateQuoteInput = Omit<
  typeof quotes.$inferInsert,
  | 'id'
  | 'organizationId'
  | 'number'
  | 'subtotalCents'
  | 'discountCents'
  | 'taxCents'
  | 'totalCents'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
> & {
  discountCents?: bigint;
};

export type CreateQuoteItemInput = Omit<
  typeof quoteItems.$inferInsert,
  'id' | 'organizationId' | 'quoteId' | 'amountCents'
>;

export type UpdateQuoteInput = Partial<CreateQuoteInput>;

export function calculateQuoteTotals(
  items: { quantity: string; unitPriceCents: bigint; discountBps: number }[],
  discountCentsInput: bigint = 0n,
  taxRateBpsInput: number = 0
) {
  let subtotalCents = 0n;
  for (const item of items) {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = BigInt(item.unitPriceCents);
    const disc = BigInt(item.discountBps || 0);
    // lineAmount = quantity * unitPriceCents * (10000 - discountBps) / 10000
    const amt = BigInt(Math.round(qty * Number(unitPrice) * (10000 - Number(disc)) / 10000));
    subtotalCents += amt;
  }

  const discountCents = discountCentsInput;
  const afterDiscount = subtotalCents - discountCents;
  const taxRateBps = taxRateBpsInput;
  const taxCents = BigInt(Math.round(Number(afterDiscount) * taxRateBps / 10000));
  const totalCents = afterDiscount + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxRateBps,
    taxCents,
    totalCents,
  };
}

export async function createQuote(
  organizationId: string,
  input: CreateQuoteInput,
  items: CreateQuoteItemInput[],
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

    // 2. Calculate totals
    const totalsInput = items.map(item => ({
      quantity: item.quantity || '0',
      unitPriceCents: BigInt(item.unitPriceCents),
      discountBps: item.discountBps || 0,
    }));
    const totals = calculateQuoteTotals(totalsInput, input.discountCents || 0n, input.taxRateBps || 0);

    // 3. Generate sequence number
    const currentYear = new Date().getFullYear();
    const number = await getNextSequenceNumber(tx, organizationId, 'quote', currentYear);

    // 4. Insert quote
    const [quote] = await tx
      .insert(quotes)
      .values({
        ...input,
        organizationId,
        number,
        status: input.status || 'draft',
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        createdBy: actorUserId || null,
      })
      .returning();

    // 5. Insert quote items
    const itemsToInsert = items.map((item, index) => {
      // `quantity` is optional at insert time (schema default '1.000').
      const qty = parseFloat(item.quantity ?? '1') || 0;
      const unitPrice = BigInt(item.unitPriceCents);
      const disc = BigInt(item.discountBps || 0);
      const amountCents = BigInt(Math.round(qty * Number(unitPrice) * (10000 - Number(disc)) / 10000));

      return {
        ...item,
        organizationId,
        quoteId: quote.id,
        position: item.position !== undefined ? item.position : index + 1,
        amountCents,
      };
    });

    let insertedItems: typeof quoteItems.$inferSelect[] = [];
    if (itemsToInsert.length > 0) {
      insertedItems = await tx
        .insert(quoteItems)
        .values(itemsToInsert)
        .returning();
    }

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'quote.created',
      targetType: 'quote',
      targetId: quote.id,
      ipAddress,
      metadata: { number, totalCents: totals.totalCents.toString() },
    });

    const quoteWithItems = { ...quote, items: insertedItems };

    await emit('quote.created', organizationId, { quote: quoteWithItems });

    return quoteWithItems;
  });
}

export async function getQuoteById(organizationId: string, id: string) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId), sql`deleted_at IS NULL`));

  if (!quote) return null;

  const itemsList = await db
    .select()
    .from(quoteItems)
    .where(and(eq(quoteItems.quoteId, id), eq(quoteItems.organizationId, organizationId)))
    .orderBy(quoteItems.position);

  return {
    ...quote,
    items: itemsList,
  };
}

export async function listQuotes(
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
    conditions.push(eq(quotes.projectId, options.projectId));
  }
  if (options?.clientId) {
    conditions.push(eq(quotes.clientId, options.clientId));
  }
  if (options?.status) {
    conditions.push(eq(quotes.status, options.status));
  }

  const results = await tdb
    .select(quotes, and(...conditions))
    .orderBy(desc(quotes.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateQuote(
  organizationId: string,
  id: string,
  input: UpdateQuoteInput,
  items?: CreateQuoteItemInput[],
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId), sql`deleted_at IS NULL`));

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Quote not found', 404);
    }

    // Determine current items if not updated, or use the new ones
    let currentItems: { quantity: string; unitPriceCents: bigint; discountBps: number }[] = [];
    if (items) {
      currentItems = items.map(item => ({
        quantity: item.quantity || '0',
        unitPriceCents: BigInt(item.unitPriceCents),
        discountBps: item.discountBps || 0,
      }));
    } else {
      const dbItems = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, id))
        .orderBy(quoteItems.position);
      currentItems = dbItems.map(item => ({
        quantity: item.quantity,
        unitPriceCents: BigInt(item.unitPriceCents),
        discountBps: item.discountBps || 0,
      }));
    }

    const discountCentsInput = input.discountCents !== undefined ? input.discountCents : BigInt(existing.discountCents);
    const taxRateBpsInput = input.taxRateBps !== undefined ? input.taxRateBps : existing.taxRateBps;

    const totals = calculateQuoteTotals(currentItems, discountCentsInput, taxRateBpsInput);

    // Update quote
    const [quote] = await tx
      .update(quotes)
      .set({
        ...input,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, id))
      .returning();

    // Update items if provided
    let updatedItems: typeof quoteItems.$inferSelect[] = [];
    if (items) {
      // Delete old items
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));

      // Insert new items
      const itemsToInsert = items.map((item, index) => {
        // `quantity` is optional at insert time (schema default '1.000').
      const qty = parseFloat(item.quantity ?? '1') || 0;
        const unitPrice = BigInt(item.unitPriceCents);
        const disc = BigInt(item.discountBps || 0);
        const amountCents = BigInt(Math.round(qty * Number(unitPrice) * (10000 - Number(disc)) / 10000));

        return {
          ...item,
          organizationId,
          quoteId: id,
          position: item.position !== undefined ? item.position : index + 1,
          amountCents,
        };
      });

      if (itemsToInsert.length > 0) {
        updatedItems = await tx
          .insert(quoteItems)
          .values(itemsToInsert)
          .returning();
      }
    } else {
      updatedItems = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, id))
        .orderBy(quoteItems.position);
    }

    const changed: string[] = [];
    for (const key of Object.keys(input)) {
      if ((input as any)[key] !== (existing as any)[key]) {
        changed.push(key);
      }
    }
    if (items) {
      changed.push('items');
    }

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'quote.updated',
      targetType: 'quote',
      targetId: id,
      ipAddress,
      metadata: { changed },
    });

    const quoteWithItems = { ...quote, items: updatedItems };

    await emit('quote.updated', organizationId, { quote: quoteWithItems, changed });

    return quoteWithItems;
  });
}

export async function deleteQuote(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const [existing] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Quote not found', 404);
  }

  const [deletedQuote] = await db
    .update(quotes)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId)))
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'quote.deleted',
    targetType: 'quote',
    targetId: id,
    ipAddress,
  });

  await emit('quote.deleted', organizationId, { quote: deletedQuote });

  return deletedQuote;
}
