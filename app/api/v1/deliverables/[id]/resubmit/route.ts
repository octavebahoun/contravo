import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { resubmitDeliverable } from '@/lib/repositories/deliverables.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/** POST /api/v1/deliverables/:id/resubmit → creates version v+1 (MVP3 §5). */

const resubmitSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  fileId: z.string().uuid().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fileMime: z.string().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'deliverables:write');

    const { id } = await params;
    const body = await request.json();
    const validated = resubmitSchema.parse(body);

    const deliverable = await resubmitDeliverable(
      ctx.organizationId,
      id,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(deliverable, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
