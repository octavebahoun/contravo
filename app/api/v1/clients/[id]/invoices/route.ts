import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { invoices } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { serializeInvoice } from '@/lib/repositories/invoices.repo';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'clients:read');

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const clientInvoices = await ctx.db.select(
      invoices,
      and(
        eq(invoices.clientId, id),
        sql`deleted_at IS NULL`
      )
    )
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ invoices: clientInvoices.map(serializeInvoice) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
