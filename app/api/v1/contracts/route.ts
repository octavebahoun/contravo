import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createContract, listContracts } from '@/lib/repositories/contracts.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const createContractSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid(),
  quoteId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  status: z.enum(['draft', 'sent', 'signed', 'cancelled', 'expired']).default('draft'),
  bodyMarkdown: z.string().default(''),
  expiresAt: z.string().transform((val) => new Date(val)).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'contracts:read');

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId') || undefined;
    const clientId = searchParams.get('clientId') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const contractsList = await listContracts(ctx.organizationId, {
      projectId,
      clientId,
      status,
      page,
      limit,
    });

    return NextResponse.json({ contracts: contractsList });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'contracts:write');

    const body = await request.json();
    const validated = createContractSchema.parse(body);

    const contract = await createContract(
      ctx.organizationId,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(contract, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
