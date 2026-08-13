import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getInvoiceById, updateInvoice, deleteInvoice } from '@/lib/repositories/invoices.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

const updateInvoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string(),
  unit: z.string().default('unit'),
  unitPriceCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))),
  discountBps: z.number().default(0),
  position: z.number().optional(),
});

const updateInvoiceSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional().nullable(),
  currency: z.string().optional(),
  discountCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).optional(),
  taxRateBps: z.number().optional(),
  dueDate: z.string().transform((val) => new Date(val)).optional(),
  notes: z.string().optional().nullable(),
  items: z.array(updateInvoiceItemSchema).optional(),
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

    const serializedInvoice = {
      ...invoice,
      subtotalCents: invoice.subtotalCents.toString(),
      discountCents: invoice.discountCents.toString(),
      taxCents: invoice.taxCents.toString(),
      totalCents: invoice.totalCents.toString(),
      amountPaidCents: invoice.amountPaidCents.toString(),
      amountDueCents: invoice.amountDueCents.toString(),
      items: invoice.items.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
      payments: invoice.payments.map((p) => ({
        ...p,
        amountCents: p.amountCents.toString(),
        netAmountCents: p.netAmountCents.toString(),
        gatewayFeesCents: p.gatewayFeesCents?.toString() || null,
      })),
    };

    return NextResponse.json(serializedInvoice);
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
    checkScope(ctx, 'invoices:write');

    const body = await request.json();
    const validated = updateInvoiceSchema.parse(body);

    const { items, ...invoiceInput } = validated;

    const invoice = await updateInvoice(
      ctx.organizationId,
      id,
      invoiceInput,
      items,
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
      items: invoice.items.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
      payments: invoice.payments.map((p) => ({
        ...p,
        amountCents: p.amountCents.toString(),
        netAmountCents: p.netAmountCents.toString(),
        gatewayFeesCents: p.gatewayFeesCents?.toString() || null,
      })),
    };

    return NextResponse.json(serializedInvoice);
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
    checkScope(ctx, 'invoices:delete');

    const invoice = await deleteInvoice(
      ctx.organizationId,
      id,
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
    };

    return NextResponse.json(serializedInvoice);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
