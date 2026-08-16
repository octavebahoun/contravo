import { eq, and, sql, desc, or, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { invoices, invoiceItems, invoicePayments, clients, projects } from '@/lib/db/schema';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';
import { getNextSequenceNumber } from './sequences.repo';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';

export type CreateInvoiceInput = Omit<
  typeof invoices.$inferInsert,
  | 'id'
  | 'organizationId'
  | 'number'
  | 'subtotalCents'
  | 'discountCents'
  | 'taxCents'
  | 'totalCents'
  | 'amountPaidCents'
  | 'amountDueCents'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
> & {
  discountCents?: bigint;
};

export type CreateInvoiceItemInput = Omit<
  typeof invoiceItems.$inferInsert,
  'id' | 'organizationId' | 'invoiceId' | 'amountCents'
>;

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

export function calculateInvoiceTotals(
  items: { quantity: string; unitPriceCents: bigint; discountBps: number }[],
  discountCentsInput: bigint = 0n,
  taxRateBpsInput: number = 0
) {
  let subtotalCents = 0n;
  for (const item of items) {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = BigInt(item.unitPriceCents);
    const disc = BigInt(item.discountBps || 0);
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

export async function createInvoice(
  organizationId: string,
  input: CreateInvoiceInput,
  items: CreateInvoiceItemInput[],
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    // 1. Validate client exist
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId), sql`deleted_at IS NULL`));
    if (!client) {
      throw new ApiError('VALIDATION_ERROR', 'Client not found', 400);
    }

    if (input.projectId) {
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), sql`deleted_at IS NULL`));
      if (!project) {
        throw new ApiError('VALIDATION_ERROR', 'Project not found', 400);
      }
    }

    // 2. Calculate totals
    const totalsInput = items.map(item => ({
      quantity: item.quantity || '0',
      unitPriceCents: BigInt(item.unitPriceCents),
      discountBps: item.discountBps || 0,
    }));
    const totals = calculateInvoiceTotals(totalsInput, input.discountCents || 0n, input.taxRateBps || 0);

    // 3. Generate sequence number
    const currentYear = new Date().getFullYear();
    const number = await getNextSequenceNumber(tx, organizationId, 'invoice', currentYear);

    // 4. Insert invoice
    const [invoice] = await tx
      .insert(invoices)
      .values({
        ...input,
        organizationId,
        number,
        status: input.status || 'draft',
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        amountPaidCents: 0n,
        createdBy: actorUserId || null,
      })
      .returning();

    // 5. Insert invoice items
    const itemsToInsert = items.map((item, index) => {
      // `quantity` is optional at insert time (schema default '1.000').
      const qty = parseFloat(item.quantity ?? '1') || 0;
      const unitPrice = BigInt(item.unitPriceCents);
      const disc = BigInt(item.discountBps || 0);
      const amountCents = BigInt(Math.round(qty * Number(unitPrice) * (10000 - Number(disc)) / 10000));

      return {
        ...item,
        organizationId,
        invoiceId: invoice.id,
        position: item.position !== undefined ? item.position : index + 1,
        amountCents,
      };
    });

    let insertedItems: typeof invoiceItems.$inferSelect[] = [];
    if (itemsToInsert.length > 0) {
      insertedItems = await tx
        .insert(invoiceItems)
        .values(itemsToInsert)
        .returning();
    }

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'invoice.created',
      targetType: 'invoice',
      targetId: invoice.id,
      ipAddress,
      metadata: { number, totalCents: totals.totalCents.toString() },
    });

    const invoiceWithItems = { ...invoice, items: insertedItems, payments: [] };

    await emit('invoice.created', organizationId, { invoice: invoiceWithItems });

    if (invoice.status === 'sent') {
      try {
        const sentPayload = await buildEventPayload({
          organizationId,
          entityKind: 'invoice',
          entityId: invoice.id,
          entity: invoiceWithItems,
          withPortalUrl: true,
          withPdfUrl: true,
          extra: undefined,
        });
        await emit('invoice.sent', organizationId, sentPayload);
      } catch (emitErr) {
        console.error(`Failed to emit invoice.sent for created invoice ${invoice.id}:`, emitErr);
      }
    }

    return invoiceWithItems;
  });
}

export async function getInvoiceById(organizationId: string, id: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId), sql`deleted_at IS NULL`));

  if (!invoice) return null;

  const itemsList = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(invoiceItems.position);

  const paymentsList = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, id))
    .orderBy(desc(invoicePayments.paidAt));

  return {
    ...invoice,
    items: itemsList,
    payments: paymentsList,
  };
}

export async function listInvoices(
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
    conditions.push(eq(invoices.projectId, options.projectId));
  }
  if (options?.clientId) {
    conditions.push(eq(invoices.clientId, options.clientId));
  }
  if (options?.status) {
    conditions.push(eq(invoices.status, options.status));
  }

  const results = await tdb
    .select(invoices, and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateInvoice(
  organizationId: string,
  id: string,
  input: UpdateInvoiceInput,
  items?: CreateInvoiceItemInput[],
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId), sql`deleted_at IS NULL`));

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
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
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(invoiceItems.position);
      currentItems = dbItems.map(item => ({
        quantity: item.quantity,
        unitPriceCents: BigInt(item.unitPriceCents),
        discountBps: item.discountBps || 0,
      }));
    }

    const discountCentsInput = input.discountCents !== undefined ? input.discountCents : BigInt(existing.discountCents);
    const taxRateBpsInput = input.taxRateBps !== undefined ? input.taxRateBps : existing.taxRateBps;

    const totals = calculateInvoiceTotals(currentItems, discountCentsInput, taxRateBpsInput);

    // Update invoice
    const [invoice] = await tx
      .update(invoices)
      .set({
        ...input,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    // Update items if provided
    let updatedItems: typeof invoiceItems.$inferSelect[] = [];
    if (items) {
      // Delete old items
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

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
          invoiceId: id,
          position: item.position !== undefined ? item.position : index + 1,
          amountCents,
        };
      });

      if (itemsToInsert.length > 0) {
        updatedItems = await tx
          .insert(invoiceItems)
          .values(itemsToInsert)
          .returning();
      }
    } else {
      updatedItems = await tx
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(invoiceItems.position);
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
      action: 'invoice.updated',
      targetType: 'invoice',
      targetId: id,
      ipAddress,
      metadata: { changed },
    });

    const paymentsList = await tx
      .select()
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, id))
      .orderBy(desc(invoicePayments.paidAt));

    const invoiceWithItems = { ...invoice, items: updatedItems, payments: paymentsList };

    await emit('invoice.updated', organizationId, { invoice: invoiceWithItems, changed });

    return invoiceWithItems;
  });
}

export async function deleteInvoice(
  organizationId: string,
  id: string,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const tdb = tenantDb(organizationId);

  const [existing] = await tdb
    .select(invoices, and(eq(invoices.id, id), sql`deleted_at IS NULL`));

  if (!existing) {
    throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
  }

  // Check if invoice status is draft
  if (existing.status !== 'draft') {
    throw new ApiError('VALIDATION_ERROR', 'Only draft invoices can be deleted', 400);
  }

  // tenantDb.update takes (table, values, condition) and applies the
  // organization filter itself — it is not the chainable Drizzle builder.
  const [deletedInvoice] = await tdb
    .update(
      invoices,
      { deletedAt: new Date(), updatedAt: new Date() },
      eq(invoices.id, id)
    )
    .returning();

  await createAuditLog({
    organizationId,
    actorUserId,
    action: 'invoice.deleted',
    targetType: 'invoice',
    targetId: id,
    ipAddress,
  });

  await emit('invoice.deleted', organizationId, { invoice: deletedInvoice });

  return deletedInvoice;
}

export async function recordPayment(
  organizationId: string,
  invoiceId: string,
  input: {
    amountCents: bigint;
    method: string;
    source: string;
    paymentIntentId?: string | null;
    gatewayReference?: string | null;
    gatewayFeesCents?: bigint | null;
    reference?: string | null;
    notes?: string | null;
    paidAt?: Date;
  },
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  return await db.transaction(async (tx) => {
    // 1. Get the invoice
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId), sql`deleted_at IS NULL`));

    if (!invoice) {
      throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
    }

    // 2. Insert invoice payment
    const [payment] = await tx
      .insert(invoicePayments)
      .values({
        organizationId,
        invoiceId,
        amountCents: input.amountCents,
        paidAt: input.paidAt || new Date(),
        method: input.method,
        source: input.source,
        paymentIntentId: input.paymentIntentId || null,
        gatewayReference: input.gatewayReference || null,
        gatewayFeesCents: input.gatewayFeesCents || null,
        netAmountCents: input.amountCents - (input.gatewayFeesCents || 0n),
        reference: input.reference || null,
        notes: input.notes || null,
        recordedBy: actorUserId || null,
      })
      .returning();

    // 3. Recalculate amountPaidCents
    const allPayments = await tx
      .select()
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, invoiceId));

    const totalPaid = allPayments.reduce((sum, p) => sum + BigInt(p.amountCents), 0n);

    // 4. Update invoice status
    let status = invoice.status;
    let paidAt = invoice.paidAt;

    if (totalPaid >= BigInt(invoice.totalCents)) {
      status = 'paid';
      paidAt = new Date();
    } else if (totalPaid > 0n) {
      status = 'partial';
      paidAt = null;
    } else {
      status = 'sent';
      paidAt = null;
    }

    const [updatedInvoice] = await tx
      .update(invoices)
      .set({
        amountPaidCents: totalPaid,
        status,
        paidAt,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await createAuditLog({
      organizationId,
      actorUserId,
      action: 'invoice.payment_recorded',
      targetType: 'invoice',
      targetId: invoiceId,
      ipAddress,
      metadata: { paymentId: payment.id, amountCents: input.amountCents.toString(), newStatus: status },
    });

    // Emit events
    if (status === 'paid') {
      await emit('invoice.paid', organizationId, { invoice: updatedInvoice, totalPaid: totalPaid.toString() });
    } else {
      await emit('invoice.updated', organizationId, { invoice: updatedInvoice, changed: ['amountPaidCents', 'status'] });
    }

    return { payment, invoice: updatedInvoice };
  });
}
