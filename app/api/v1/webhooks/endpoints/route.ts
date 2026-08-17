import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  serializeWebhookEndpoint,
} from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/**
 * Outbound webhook endpoints owned by the organization (MVP3 §6).
 *
 * `createWebhookEndpoint()` existed in the library with no route calling it, and
 * the developer screen's "Enregistrer l'Endpoint" button had no handler at all —
 * so an organization could not register a destination for its events through any
 * means. Only the platform's global `n8n_primary` endpoint existed, seeded by
 * hand.
 *
 * Sits under `/api/v1/webhooks/` alongside the *inbound* receivers
 * (`geniuspay`, `excellence-events`). Those are exempt from middleware auth by
 * exact pathname, so this route is authenticated normally.
 */

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:read');

    const endpoints = await listWebhookEndpoints(ctx.organizationId);

    return NextResponse.json({ endpoints: endpoints.map(serializeWebhookEndpoint) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:manage');

    const body = await request.json().catch(() => ({}));
    const { url, events } = createSchema.parse(body);

    const endpoint = await createWebhookEndpoint({
      organizationId: ctx.organizationId,
      url,
      events,
    });

    // The signing secret is returned exactly once, like an API key: it is what
    // the consumer needs to verify `X-Webhook-Signature`, and it is never listed
    // again. `POST /:id/rotate-secret` issues a new one.
    return NextResponse.json(
      { ...serializeWebhookEndpoint(endpoint), secret: endpoint.secret },
      { status: 201 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}
