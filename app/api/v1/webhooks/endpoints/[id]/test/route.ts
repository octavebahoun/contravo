import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { sendWebhookTest } from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Sends a signed `webhook.test` event and reports what the consumer answered.
 *
 * Awaits the dispatch, unlike `emit()`: the whole point is to tell the user
 * straight away whether their URL responded, and with which status. Without it
 * the only way to find out an endpoint was misconfigured was to wait for a real
 * business event to fail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:manage');

    const delivery = await sendWebhookTest(id, ctx.organizationId);

    return NextResponse.json({
      deliveryId: delivery.id,
      status: delivery.status,
      attempts: delivery.attempts,
      responseCode: delivery.lastResponseCode,
      responseBody: delivery.lastResponseBody,
      deliveredAt: delivery.deliveredAt,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
