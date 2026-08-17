import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listWebhookDeliveries } from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Delivery history of the organization's own endpoints (MVP5 §6).
 *
 * The outbox already recorded every attempt, its HTTP status and its next retry
 * time, but nothing exposed it: a failing integration was only visible by
 * querying the database directly.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:read');

    const searchParams = request.nextUrl.searchParams;

    const deliveries = await listWebhookDeliveries(ctx.organizationId, {
      endpointId: searchParams.get('endpointId') || undefined,
      status: searchParams.get('status') || undefined,
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    return NextResponse.json({ deliveries });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
