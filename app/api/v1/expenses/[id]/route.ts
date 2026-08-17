import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import {
  deleteExpense,
  getExpenseById,
  serializeExpense,
  updateExpense,
} from '@/lib/repositories/expenses.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

/** Single expense endpoints (MVP3 §5). */

const updateExpenseSchema = z.object({
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  amountCents: z.union([z.number().int(), z.string()]).optional(),
  currency: z.string().min(3).max(3).optional(),
  incurredOn: z.string().optional(),
  vendor: z.string().optional().nullable(),
  receiptFileId: z.string().uuid().optional().nullable(),
  billable: z.boolean().optional(),
  reimbursed: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:read');

    const { id } = await params;
    const expense = await getExpenseById(ctx.organizationId, id);

    if (!expense) {
      throw new ApiError('NOT_FOUND', 'Expense not found', 404);
    }

    return NextResponse.json(serializeExpense(expense));
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:write');

    const { id } = await params;
    const body = await request.json();
    const validated = updateExpenseSchema.parse(body);

    const expense = await updateExpense(
      ctx.organizationId,
      id,
      {
        ...validated,
        ...(validated.amountCents !== undefined
          ? { amountCents: BigInt(validated.amountCents) }
          : {}),
      } as never,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(serializeExpense(expense));
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'expenses:delete');

    const { id } = await params;
    await deleteExpense(
      ctx.organizationId,
      id,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
