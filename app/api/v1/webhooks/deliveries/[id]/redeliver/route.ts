import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { redeliverWebhook } from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Replays one delivery (MVP5 §6).
 *
 * `redeliverWebhook()` had been written and left unreachable — no route called
 * it — so an exhausted delivery could never be retried once its six automatic
 * attempts were spent.
 *
 * Note it only resolves deliveries belonging to the organization's own endpoints:
 * the platform's global `n8n_primary` endpoint carries no `organization_id`, so
 * its deliveries are not replayable from here by design.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:manage');

    const result = await redeliverWebhook(id, ctx.organizationId);

    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
