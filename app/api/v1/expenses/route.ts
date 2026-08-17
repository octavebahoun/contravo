import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createExpense, listExpenses, serializeExpense } from '@/lib/repositories/expenses.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/** Expense collection endpoints (MVP3 §5). */

const createExpenseSchema = z.object({
  projectId: z.string().uuid(),
  category: z.string().min(1),
  description: z.string().min(1),
  amountCents: z.union([z.number().int(), z.string()]),
  currency: z.string().min(3).max(3).optional(),
  incurredOn: z.string(),
  vendor: z.string().optional().nullable(),
  receiptFileId: z.string().uuid().optional().nullable(),
  billable: z.boolean().optional(),
  reimbursed: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:read');

    const searchParams = request.nextUrl.searchParams;

    const expenses = await listExpenses(ctx.organizationId, {
      projectId: searchParams.get('projectId') || undefined,
      category: searchParams.get('category') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
    });

    return NextResponse.json({ expenses: expenses.map(serializeExpense) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:write');

    const body = await request.json();
    const validated = createExpenseSchema.parse(body);

    const expense = await createExpense(
      ctx.organizationId,
      {
        ...validated,
        amountCents: BigInt(validated.amountCents),
        incurredOn: validated.incurredOn,
      } as never,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(serializeExpense(expense), { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
