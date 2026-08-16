import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { webhookEndpoints, webhookDeliveries } from '@/lib/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';

export type CreateWebhookEndpointParams = {
  organizationId: string;
  url: string;
  events: string[];
};

export async function createWebhookEndpoint(
  params: CreateWebhookEndpointParams
): Promise<any> {
  if (!params.url.startsWith('https://')) {
    throw new ApiError('VALIDATION_ERROR', 'Webhook URL must use HTTPS', 400);
  }

  // Generate 32 bytes secret
  const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url');

  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId: params.organizationId,
      url: params.url,
      secret,
      events: params.events,
      active: true,
    })
    .returning();

  return endpoint;
}

export function signPayload(payload: string, secret: string, timestamp: number): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  return `t=${timestamp},v1=${hmac.digest('hex')}`;
}

export async function emit(
  event: string,
  organizationId: string,
  data: any
): Promise<void> {
  // Find matching active endpoints (specific organization OR global n8n_primary)
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.active, true),
        or(
          eq(webhookEndpoints.organizationId, organizationId),
          eq(webhookEndpoints.kind, 'n8n_primary')
        )
      )
    );

  const matchedEndpoints = endpoints.filter(
    (ep) => ep.events.includes(event) || ep.events.includes('*')
  );

  for (const ep of matchedEndpoints) {
    const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
    const payload = {
      id: eventId,
      type: event,
      created: new Date().toISOString(),
      organizationId: organizationId,
      data: data,
      apiVersion: 'v1',
    };

    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        endpointId: ep.id,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      })
      .returning();

    // Trigger delivery in background (does not block application execution)
    dispatchDelivery(delivery.id, ep.url, ep.secret, payload).catch((err) => {
      console.error(`Error dispatching webhook delivery ${delivery.id}:`, err);
    });
  }
}

// Background delivery function (real attempt with fallback to logging/stub error)
async function dispatchDelivery(
  deliveryId: string,
  url: string,
  secret: string,
  payload: any
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, secret, timestamp);

  // Update attempts
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) return;

  const currentAttempt = delivery.attempts + 1;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  let lastResponseCode: number | null = null;
  let lastResponseBody = '';
  let status: 'success' | 'failed' | 'exhausted' = 'failed';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Webhook-Signature': signature,
        'User-Agent': 'Contravo-Webhook-Dispatcher/1.0',
      },
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    lastResponseCode = res.status;
    lastResponseBody = (await res.text()).substring(0, 2048); // Truncate to 2KB

    if (res.ok) {
      status = 'success';
    } else {
      status = 'failed';
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    lastResponseCode = null;
    lastResponseBody = `Fetch Error: ${error?.message || 'Unknown error'}`.substring(0, 2048);
    status = 'failed';
  }

  // Handle retry logic (backoff: 1min, 5min, 30min, 2h, 6h, 24h -> 6 max attempts)
  const backoffMinutes = [1, 5, 30, 120, 360, 1440];
  let nextRetryAt: Date | null = null;

  if (status === 'failed') {
    if (currentAttempt >= 6) {
      status = 'exhausted';
    } else {
      const minutes = backoffMinutes[currentAttempt - 1] || 1440;
      nextRetryAt = new Date(Date.now() + minutes * 60 * 1000);
    }
  }

  await db
    .update(webhookDeliveries)
    .set({
      status,
      attempts: currentAttempt,
      nextRetryAt,
      lastResponseCode,
      lastResponseBody,
      deliveredAt: status === 'success' ? new Date() : null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}

// Manual redelivery trigger
export async function redeliverWebhook(
  deliveryId: string,
  organizationId: string
): Promise<any> {
  const result = await db
    .select({
      delivery: webhookDeliveries,
      endpoint: webhookEndpoints,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookEndpoints.organizationId, organizationId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new ApiError('NOT_FOUND', 'Webhook delivery not found', 404);
  }

  const { delivery, endpoint } = result[0];

  // Reset to pending
  await db
    .update(webhookDeliveries)
    .set({
      status: 'pending',
      nextRetryAt: null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  // Run dispatch in background
  dispatchDelivery(deliveryId, endpoint.url, endpoint.secret, delivery.payload).catch(console.error);

  return { message: 'Webhook redelivery scheduled' };
}
