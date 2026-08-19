import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listInvoiceReminders, sendManualReminder } from '@/lib/workflows/invoice-reminders';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Reminders on one invoice (MVP5 §3.2).
 *
 * `GET` is the history — automatic rungs and hand-sent notices in the same list,
 * so the team can see what the client has already received before adding to it.
 * `POST` sends one now, which is the point: chasing a client used to be entirely
 * the scheduler's decision.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'invoices:read');

    return NextResponse.json({ reminders: await listInvoiceReminders(ctx.organizationId, id) });
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

    const result = await sendManualReminder({
      organizationId: ctx.organizationId,
      invoiceId: id,
      userId: ctx.userId ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
