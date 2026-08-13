import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { transitionQuote } from '@/lib/workflows/quote.state';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const transitionSchema = z.object({
  action: z.enum(['send', 'view', 'accept', 'reject', 'cancel', 'expire']),
  rejectionReason: z.string().optional(),
  acceptedByName: z.string().optional(),
  acceptedByEmail: z.string().optional(),
  acceptedByIp: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:write');

    const body = await request.json();
    const validated = transitionSchema.parse(body);

    const quote = await transitionQuote(
      ctx.organizationId,
      id,
      validated.action,
      {
        rejectionReason: validated.rejectionReason,
        acceptedByName: validated.acceptedByName,
        acceptedByEmail: validated.acceptedByEmail,
        acceptedByIp: validated.acceptedByIp,
      },
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedQuote = {
      ...quote,
      subtotalCents: quote.subtotalCents.toString(),
      discountCents: quote.discountCents.toString(),
      taxCents: quote.taxCents.toString(),
      totalCents: quote.totalCents.toString(),
      items: quote.items?.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
    };

    return NextResponse.json(serializedQuote);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
