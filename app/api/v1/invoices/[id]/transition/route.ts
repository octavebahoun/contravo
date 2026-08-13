import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { transitionInvoice } from '@/lib/workflows/invoice.state';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const transitionSchema = z.object({
  action: z.enum(['send', 'cancel', 'refund', 'mark_overdue']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:write');

    const body = await request.json();
    const validated = transitionSchema.parse(body);

    const invoice = await transitionInvoice(
      ctx.organizationId,
      id,
      validated.action,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedInvoice = {
      ...invoice,
      subtotalCents: invoice.subtotalCents.toString(),
      discountCents: invoice.discountCents.toString(),
      taxCents: invoice.taxCents.toString(),
      totalCents: invoice.totalCents.toString(),
      amountPaidCents: invoice.amountPaidCents.toString(),
      amountDueCents: invoice.amountDueCents.toString(),
      items: invoice.items?.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
    };

    return NextResponse.json(serializedInvoice);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
