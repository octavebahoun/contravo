import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { invoiceItems, invoices, organizations } from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { requirePortalAccess } from '@/lib/portal/portal-guard';

/**
 * Invoice as seen by the client in the portal (MVP2 §3, MVP3 §5).
 *
 * Carries the outstanding balance and bank details, which is what the payment
 * screen needs; `canPay` tells the page whether to offer the GeniusPay flow.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('read');
    const { id } = await params;

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.organizationId, ctx.organizationId),
          isNull(invoices.deletedAt)
        )
      )
      .limit(1);

    if (!invoice) {
      throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
    }

    const items = await db
      .select({
        position: invoiceItems.position,
        description: invoiceItems.description,
        quantity: invoiceItems.quantity,
        unit: invoiceItems.unit,
        unitPriceCents: invoiceItems.unitPriceCents,
        discountBps: invoiceItems.discountBps,
        amountCents: invoiceItems.amountCents,
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.position));

    const [org] = await db
      .select({
        name: organizations.name,
        brandColor: organizations.brandColor,
        bankDetails: organizations.bankDetails,
      })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);

    const amountDue = Number(invoice.amountDueCents ?? 0);

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        currency: invoice.currency,
        subtotalCents: Number(invoice.subtotalCents),
        discountCents: Number(invoice.discountCents),
        taxRateBps: invoice.taxRateBps,
        taxCents: Number(invoice.taxCents),
        totalCents: Number(invoice.totalCents),
        amountPaidCents: Number(invoice.amountPaidCents ?? 0),
        amountDueCents: amountDue,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        notes: invoice.notes,
        items: items.map((item) => ({
          ...item,
          unitPriceCents: Number(item.unitPriceCents),
          amountCents: Number(item.amountCents),
        })),
      },
      organization: org
        ? {
            name: org.name,
            brandColor: org.brandColor,
            bankDetails: org.bankDetails ?? null,
          }
        : null,
      recipientEmail: ctx.recipientEmail ?? null,
      canPay:
        amountDue > 0 &&
        !['paid', 'cancelled', 'refunded'].includes(invoice.status) &&
        (ctx.scopes.includes('pay') || ctx.scopes.includes('*')),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
