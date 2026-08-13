import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { calculateProjectProfitability } from '@/lib/services/profitability.service';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:read');

    const profitability = await calculateProjectProfitability(ctx.organizationId, id);

    return NextResponse.json({ profitability });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
