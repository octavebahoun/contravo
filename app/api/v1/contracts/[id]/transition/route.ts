import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { transitionContract } from '@/lib/workflows/contract.state';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const transitionSchema = z.object({
  action: z.enum(['send', 'sign', 'cancel', 'expire']),
  signedByName: z.string().optional(),
  signedByEmail: z.string().optional(),
  signedByIp: z.string().optional(),
  signatureHash: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'contracts:write');

    const body = await request.json();
    const validated = transitionSchema.parse(body);

    const contract = await transitionContract(
      ctx.organizationId,
      id,
      validated.action,
      {
        signedByName: validated.signedByName,
        signedByEmail: validated.signedByEmail,
        signedByIp: validated.signedByIp,
        signatureHash: validated.signatureHash,
      },
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(contract);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
