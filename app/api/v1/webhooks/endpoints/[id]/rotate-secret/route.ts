import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { rotateWebhookSecret, serializeWebhookEndpoint } from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Issues a new signing secret for an endpoint, returned once.
 *
 * There is deliberately no way to read an existing secret back: a lost secret is
 * rotated, not recovered. Signatures produced with the old one stop verifying
 * immediately, so the consumer has to be updated in the same breath.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:manage');

    const endpoint = await rotateWebhookSecret(id, ctx.organizationId);

    return NextResponse.json({
      ...serializeWebhookEndpoint(endpoint),
      secret: endpoint.secret,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
