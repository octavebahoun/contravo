import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getQuoteById, updateQuote, deleteQuote } from '@/lib/repositories/quotes.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

const updateQuoteItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string(),
  unit: z.string().default('unit'),
  unitPriceCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))),
  discountBps: z.number().default(0),
  position: z.number().optional(),
});

const updateQuoteSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  validUntil: z.string().transform((val) => new Date(val)).optional(),
  currency: z.string().optional(),
  discountCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).optional(),
  taxRateBps: z.number().optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  items: z.array(updateQuoteItemSchema).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:read');

    const quote = await getQuoteById(ctx.organizationId, id);
    if (!quote) {
      throw new ApiError('NOT_FOUND', 'Quote not found', 404);
    }

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

    return NextResponse.json(serializedQuote);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:write');

    const body = await request.json();
    const validated = updateQuoteSchema.parse(body);

    const { items, ...quoteInput } = validated;

    const quote = await updateQuote(
      ctx.organizationId,
      id,
      quoteInput,
      items,
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

    return NextResponse.json(serializedQuote);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'quotes:delete');

    const quote = await deleteQuote(
      ctx.organizationId,
      id,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedQuote = {
      ...quote,
      subtotalCents: quote.subtotalCents.toString(),
      discountCents: quote.discountCents.toString(),
      taxCents: quote.taxCents.toString(),
      totalCents: quote.totalCents.toString(),
    };

    return NextResponse.json(serializedQuote);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
