import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getClientById, updateClient, deleteClient } from '@/lib/repositories/clients.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

const updateClientSchema = z.object({
  type: z.enum(['individual', 'company']).optional(),
  displayName: z.string().min(1).optional(),
  companyName: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  billingAddress: z.any().optional().nullable(),
  shippingAddress: z.any().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'clients:read');

    const client = await getClientById(ctx.organizationId, id);
    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    return NextResponse.json(client);
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
    checkScope(ctx, 'clients:write');

    const body = await request.json();
    const validated = updateClientSchema.parse(body);

    const client = await updateClient(
      ctx.organizationId,
      id,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(client);
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
    // Enforce clients:delete scope to prevent members from deleting
    checkScope(ctx, 'clients:delete');

    const client = await deleteClient(
      ctx.organizationId,
      id,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(client);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
