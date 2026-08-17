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

/** Value that both `JSON.stringify` and a jsonb column accept. */
type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

/**
 * Deep-normalizes an event payload into JSON-serializable values.
 *
 * Drizzle returns money columns (`subtotalCents`, `totalCents`, `unitPriceCents`,
 * `amountCents`, …) as `bigint`, and several call sites emit raw entity rows.
 * `JSON.stringify` throws on `bigint`, and postgres.js stringifies before writing
 * jsonb — so an un-normalized payload threw inside the `db.transaction()` of
 * `createQuote`/`createInvoice` and rolled the whole business write back.
 *
 * Money crosses the wire as a **decimal string**, matching what the API already
 * returns for the same columns (`app/api/v1/quotes/route.ts`,
 * `app/api/v1/invoices/route.ts`). `Number()` would be lossy past 2^53 on a
 * monetary field, and the n8n templates run every placeholder through
 * `String(v)`, so they are indifferent to the type.
 *
 * Undefined handling mirrors `JSON.stringify`: dropped as an object property,
 * `null` as an array element — the wire shape is unchanged apart from bigints.
 */
export function toJsonSafe(value: unknown): JsonSafe {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item));
  }

  if (typeof value === 'object') {
    // Covers Buffer and any driver wrapper, the same way JSON.stringify would.
    const maybeToJson = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof maybeToJson === 'function') {
      return toJsonSafe(maybeToJson.call(value));
    }

    const result: { [key: string]: JsonSafe } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      result[key] = toJsonSafe(entry);
    }
    return result;
  }

  // Symbols and functions: unreachable from a DB row, but never worth throwing.
  return String(value);
}

export function signPayload(payload: string, secret: string, timestamp: number): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  return `t=${timestamp},v1=${hmac.digest('hex')}`;
}

export async function emit(
  event: string,
  organizationId: string | null,
  data: any
): Promise<void> {
  // Account-level events (password reset, for one) belong to no organization.
  // They only reach the global n8n_primary endpoint; feeding `null` into the
  // uuid comparison below would make Postgres reject the whole query.
  const scope = organizationId
    ? or(
        eq(webhookEndpoints.organizationId, organizationId),
        eq(webhookEndpoints.kind, 'n8n_primary')
      )
    : eq(webhookEndpoints.kind, 'n8n_primary');

  // Find matching active endpoints (specific organization OR global n8n_primary)
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.active, true), scope));

  const matchedEndpoints = endpoints.filter(
    (ep) => ep.events.includes(event) || ep.events.includes('*')
  );

  for (const ep of matchedEndpoints) {
    const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
    // Normalized once, here: the very same object must feed the jsonb column,
    // signPayload() and the HTTP body. Sanitizing at insert time instead would
    // leave dispatchDelivery() to throw into its silent .catch(), losing the
    // webhook with no visible error.
    const payload = toJsonSafe({
      id: eventId,
      type: event,
      created: new Date().toISOString(),
      organizationId: organizationId,
      data: data,
      apiVersion: 'v1',
    });

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

/** Maximum attempts before a delivery is considered exhausted (see backoff below). */
const MAX_ATTEMPTS = 6;
/** How long a claimed delivery is reserved before another run may retake it. */
const RETRY_LEASE_MINUTES = 10;
/**
 * Age past which a `pending` row is treated as abandoned. `dispatchDelivery` is
 * fire-and-forget, so a serverless freeze right after the response leaves the
 * row `pending` forever with no error anywhere.
 */
const PENDING_STALE_MINUTES = 15;
/** Deliveries dispatched concurrently; each carries a 10s network timeout. */
const RETRY_CONCURRENCY = 5;

export type RetrySweepResult = {
  claimed: number;
  dispatched: number;
  failures: number;
};

/**
 * Redelivers webhooks that nothing else would ever pick up (MVP5 §6).
 *
 * `dispatchDelivery` computes `next_retry_at` on failure but no worker read it,
 * so a delivery died after its first attempt: silently, with the row left
 * `failed` and a retry timestamp in the past. This sweep is that missing worker.
 *
 * Concurrency safety: rows are claimed with `FOR UPDATE SKIP LOCKED`, and the
 * claim pushes `next_retry_at` into the future as a lease. Two overlapping runs
 * therefore never dispatch the same delivery, and a run that dies mid-flight
 * releases its rows when the lease expires instead of stranding them.
 *
 * Delivery stays at-least-once: a row whose HTTP call succeeded but whose status
 * update never landed will be sent again. The payload keeps its original event
 * `id`, so a consumer can deduplicate on it — which is what our own inbound
 * endpoint does via Redis (`lib/notifications/redis-idempotency.ts`).
 */
export async function retryDueDeliveries(limit = 25): Promise<RetrySweepResult> {
  const claimed = (await db.execute(sql`
    with due as (
      select d.id
      from webhook_deliveries d
      where d.attempts < ${MAX_ATTEMPTS}
        and (
          (d.status = 'failed'
             and d.next_retry_at is not null
             and d.next_retry_at <= now())
          or
          (d.status = 'pending'
             and d.created_at <= now() - make_interval(mins => ${PENDING_STALE_MINUTES})
             and (d.next_retry_at is null or d.next_retry_at <= now()))
        )
      order by d.created_at
      for update skip locked
      limit ${limit}
    ),
    leased as (
      update webhook_deliveries d
      set next_retry_at = now() + make_interval(mins => ${RETRY_LEASE_MINUTES})
      from due
      where d.id = due.id
      returning d.id, d.payload, d.endpoint_id
    )
    select l.id, l.payload, e.url, e.secret
    from leased l
    join webhook_endpoints e on e.id = l.endpoint_id
    where e.active = true
  `)) as unknown as Array<{
    id: string;
    payload: unknown;
    url: string;
    secret: string;
  }>;

  let dispatched = 0;
  let failures = 0;

  for (let i = 0; i < claimed.length; i += RETRY_CONCURRENCY) {
    const batch = claimed.slice(i, i + RETRY_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((row) => dispatchDelivery(row.id, row.url, row.secret, row.payload))
    );

    for (const [index, outcome] of settled.entries()) {
      if (outcome.status === 'fulfilled') {
        dispatched += 1;
      } else {
        failures += 1;
        // The lease expires on its own, so the row returns to the next sweep.
        console.error(
          `Webhook retry sweep: dispatch threw for ${batch[index].id}`,
          outcome.reason
        );
      }
    }
  }

  return { claimed: claimed.length, dispatched, failures };
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
    if (currentAttempt >= MAX_ATTEMPTS) {
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
