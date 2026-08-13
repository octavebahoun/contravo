import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createClient, listClients } from '@/lib/repositories/clients.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const createClientSchema = z.object({
  type: z.enum(['individual', 'company']),
  displayName: z.string().min(1),
  companyName: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  billingAddress: z.any().optional().nullable(),
  shippingAddress: z.any().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'clients:read');

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || undefined;
    const isArchivedParam = searchParams.get('archived');
    const isArchived = isArchivedParam !== null ? isArchivedParam === 'true' : undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const clientsList = await listClients(ctx.organizationId, {
      search,
      isArchived,
      page,
      limit,
    });

    return NextResponse.json({ clients: clientsList });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'clients:write');

    const body = await request.json();
    const validated = createClientSchema.parse(body);

    const client = await createClient(
      ctx.organizationId,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(client, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
