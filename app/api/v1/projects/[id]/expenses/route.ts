import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listExpenses } from '@/lib/repositories/expenses.repo';
import { formatErrorResponse } from '@/lib/errors';

/** GET /api/v1/projects/:id/expenses — shortcut for /expenses?projectId= (MVP3 §5). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:read');

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    const expenses = await listExpenses(ctx.organizationId, {
      projectId: id,
      category: searchParams.get('category') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
    });

    return NextResponse.json({ expenses });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
