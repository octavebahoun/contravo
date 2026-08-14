import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { transitionDeliverable } from '@/lib/workflows/deliverable.state';
import { formatErrorResponse } from '@/lib/errors';

/**
 * POST /api/v1/deliverables/:id/submit → 'submitted' (MVP3 §5).
 *
 * The state machine mints the client portal token and emits
 * `deliverable.submitted`, which n8n turns into the review request email.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'deliverables:write');

    const { id } = await params;
    const deliverable = await transitionDeliverable(
      ctx.organizationId,
      id,
      'submit',
      undefined,
      ctx.userId,
      request.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json(deliverable);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
