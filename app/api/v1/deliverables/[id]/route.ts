import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getDeliverableById, updateDeliverable } from '@/lib/repositories/deliverables.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

/** Single deliverable endpoints (MVP3 §5). */

const updateDeliverableSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  fileId: z.string().uuid().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fileMime: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'deliverables:read');

    const { id } = await params;
    const deliverable = await getDeliverableById(ctx.organizationId, id);

    if (!deliverable) {
      throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
    }

    return NextResponse.json(deliverable);
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
    checkScope(ctx, 'deliverables:write');

    const { id } = await params;
    const existing = await getDeliverableById(ctx.organizationId, id);

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
    }
    // MVP3 §5: editing is only allowed before the client sees it.
    if (existing.status !== 'draft') {
      throw new ApiError(
        'CONFLICT',
        `Only draft deliverables can be edited (current: ${existing.status})`,
        409
      );
    }

    const body = await request.json();
    const validated = updateDeliverableSchema.parse(body);

    const deliverable = await updateDeliverable(
      ctx.organizationId,
      id,
      validated as never,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(deliverable);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
