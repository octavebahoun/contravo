import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createInvoice, listInvoices, serializeInvoice } from '@/lib/repositories/invoices.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const createInvoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string(),
  unit: z.string().default('unit'),
  unitPriceCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))),
  discountBps: z.number().default(0),
  position: z.number().default(0),
});

const createInvoiceSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid(),
  contractId: z.string().uuid().optional().nullable(),
  currency: z.string().default('XOF'),
  discountCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).default(0),
  taxRateBps: z.number().default(0),
  issueDate: z.string().default(() => new Date().toISOString().split('T')[0]),
  dueDate: z.string(),
  notes: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'refunded']).default('draft'),
  items: z.array(createInvoiceItemSchema),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:read');

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId') || undefined;
    const clientId = searchParams.get('clientId') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const invoicesList = await listInvoices(ctx.organizationId, {
      projectId,
      clientId,
      status,
      page,
      limit,
    });

    return NextResponse.json({ invoices: invoicesList.map(serializeInvoice) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:write');

    const body = await request.json();
    const validated = createInvoiceSchema.parse(body);

    const invoice = await createInvoice(
      ctx.organizationId,
      {
        projectId: validated.projectId,
        clientId: validated.clientId,
        contractId: validated.contractId,
        currency: validated.currency,
        discountCents: validated.discountCents,
        taxRateBps: validated.taxRateBps,
        issueDate: validated.issueDate,
        dueDate: validated.dueDate,
        notes: validated.notes,
        status: validated.status,
      },
      validated.items,
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
      amountDueCents: (invoice.amountDueCents ?? 0n).toString(),
      items: invoice.items.map((item) => ({
        ...item,
        unitPriceCents: item.unitPriceCents.toString(),
        amountCents: item.amountCents.toString(),
      })),
    };

    return NextResponse.json(serializedInvoice, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
