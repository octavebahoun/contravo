import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import {
  createDeliverable,
  listDeliverables,
  serializeDeliverable,
} from '@/lib/repositories/deliverables.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/** Project deliverables collection (MVP3 §5). */

const createDeliverableSchema = z.object({
  title: z.string().min(1),
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
    const searchParams = request.nextUrl.searchParams;

    const deliverables = await listDeliverables(ctx.organizationId, {
      projectId: id,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
    });

    return NextResponse.json({ deliverables: deliverables.map(serializeDeliverable) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

/** Creates a deliverable in `draft`; publishing happens via /submit. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'deliverables:write');

    const { id } = await params;
    const body = await request.json();
    const validated = createDeliverableSchema.parse(body);

    const deliverable = await createDeliverable(
      ctx.organizationId,
      { ...validated, projectId: id, status: 'draft' } as never,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(serializeDeliverable(deliverable), { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
