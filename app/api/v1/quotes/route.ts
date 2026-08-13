import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createQuote, listQuotes } from '@/lib/repositories/quotes.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const createQuoteItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string(),
  unit: z.string().default('unit'),
  unitPriceCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))),
  discountBps: z.number().default(0),
  position: z.number().optional(),
});

const createQuoteSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid(),
  validUntil: z.string().transform((val) => new Date(val)),
  currency: z.string().default('XOF'),
  discountCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).default(0),
  taxRateBps: z.number().default(0),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'rejected', 'cancelled', 'expired']).default('draft'),
  items: z.array(createQuoteItemSchema),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:read');

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId') || undefined;
    const clientId = searchParams.get('clientId') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const quotesList = await listQuotes(ctx.organizationId, {
      projectId,
      clientId,
      status,
      page,
      limit,
    });

    const serializedQuotes = quotesList.map((q) => ({
      ...q,
      subtotalCents: q.subtotalCents.toString(),
      discountCents: q.discountCents.toString(),
      taxCents: q.taxCents.toString(),
      totalCents: q.totalCents.toString(),
    }));

    return NextResponse.json({ quotes: serializedQuotes });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:write');

    const body = await request.json();
    const validated = createQuoteSchema.parse(body);

    const quote = await createQuote(
      ctx.organizationId,
      {
        projectId: validated.projectId,
        clientId: validated.clientId,
        validUntil: validated.validUntil,
        currency: validated.currency,
        discountCents: validated.discountCents,
        taxRateBps: validated.taxRateBps,
        notes: validated.notes,
        terms: validated.terms,
        status: validated.status,
      },
      validated.items,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedQuote = {
      ...quote,
      subtotalCents: quote.subtotalCents.toString(),
      discountCents: quote.discountCents.toString(),
      taxCents: quote.taxCents.toString(),
      totalCents: quote.totalCents.toString(),
      items: quote.items.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
    };

    return NextResponse.json(serializedQuote, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
