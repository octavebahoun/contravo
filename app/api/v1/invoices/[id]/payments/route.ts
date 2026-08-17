import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getInvoiceById, recordPayment } from '@/lib/repositories/invoices.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

/**
 * Manual payments on an invoice (MVP3 §5).
 *
 * `recordPayment` existed in the repository but was only reachable through the
 * GeniusPay webhook, so a bank transfer, a mobile-money transfer or cash — how
 * most invoices are actually settled in XOF — could not be recorded anywhere.
 * The repository does the accounting: it recomputes `amountPaidCents`, moves the
 * invoice to `partial` or `paid`, and emits `invoice.paid` when it is settled.
 */

const recordPaymentSchema = z.object({
  amountCents: z
    .string()
    .regex(/^\d+$/, 'amountCents must be a positive integer string')
    .or(z.number().int().nonnegative().transform(String)),
  method: z.enum(['bank_transfer', 'mobile_money', 'card', 'cash', 'check', 'other']),
  paidAt: z.string().optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:read');

    const invoice = await getInvoiceById(ctx.organizationId, id);
    if (!invoice) {
      throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
    }

    return NextResponse.json({
      payments: invoice.payments.map((payment) => ({
        ...payment,
        amountCents: payment.amountCents.toString(),
        netAmountCents: payment.netAmountCents?.toString() ?? null,
        gatewayFeesCents: payment.gatewayFeesCents?.toString() ?? null,
      })),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:write');

    const body = await request.json();
    const validated = recordPaymentSchema.parse(body);

    const amountCents = BigInt(validated.amountCents);
    if (amountCents <= 0n) {
      throw new ApiError('VALIDATION_ERROR', 'Le montant doit être supérieur à zéro.', 400);
    }

    const invoice = await getInvoiceById(ctx.organizationId, id);
    if (!invoice) {
      throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
    }

    // A draft has not been sent, and a cancelled or refunded invoice is closed:
    // recording money against any of them would silently reopen it as `partial`.
    if (!['sent', 'partial', 'overdue'].includes(invoice.status)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Impossible d’enregistrer un paiement sur une facture au statut '${invoice.status}'.`,
        400
      );
    }

    const { payment, invoice: updatedInvoice } = await recordPayment(
      ctx.organizationId,
      id,
      {
        amountCents,
        method: validated.method,
        source: 'manual',
        reference: validated.reference ?? null,
        notes: validated.notes ?? null,
        ...(validated.paidAt ? { paidAt: new Date(validated.paidAt) } : {}),
      },
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(
      {
        payment: {
          ...payment,
          amountCents: payment.amountCents.toString(),
          netAmountCents: payment.netAmountCents?.toString() ?? null,
          gatewayFeesCents: payment.gatewayFeesCents?.toString() ?? null,
        },
        // The caller needs the new status and balance: one payment can move the
        // invoice to `partial` or `paid`.
        invoice: {
          id: updatedInvoice.id,
          status: updatedInvoice.status,
          amountPaidCents: updatedInvoice.amountPaidCents.toString(),
          totalCents: updatedInvoice.totalCents.toString(),
          paidAt: updatedInvoice.paidAt,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}
