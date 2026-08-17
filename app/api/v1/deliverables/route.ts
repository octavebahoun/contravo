import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listDeliverables, serializeDeliverable } from '@/lib/repositories/deliverables.repo';
import { formatErrorResponse } from '@/lib/errors';

/**
 * GET /api/v1/deliverables — organization-wide deliverables list (MVP3 §5).
 *
 * The per-project collection (`/api/v1/projects/[id]/deliverables`) stays the
 * place to create one; this route only widens the same repository query so a
 * caller can see every deliverable without walking the project list first.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'deliverables:read');

    const searchParams = request.nextUrl.searchParams;

    const deliverables = await listDeliverables(ctx.organizationId, {
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    return NextResponse.json({ deliverables: deliverables.map(serializeDeliverable) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
