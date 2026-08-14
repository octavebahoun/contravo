import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getContractById, updateContract, deleteContract } from '@/lib/repositories/contracts.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

const updateContractSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).optional(),
  status: z.enum(['draft', 'sent', 'signed', 'cancelled', 'expired']).optional(),
  bodyMarkdown: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'contracts:read');

    const contract = await getContractById(ctx.organizationId, id);
    if (!contract) {
      throw new ApiError('NOT_FOUND', 'Contract not found', 404);
    }

    return NextResponse.json(contract);
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
    checkScope(ctx, 'contracts:write');

    const body = await request.json();
    const validated = updateContractSchema.parse(body);

    const contract = await updateContract(
      ctx.organizationId,
      id,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(contract);
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
    checkScope(ctx, 'contracts:delete');

    const contract = await deleteContract(
      ctx.organizationId,
      id,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(contract);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
