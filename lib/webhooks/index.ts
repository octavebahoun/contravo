import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { webhookEndpoints, webhookDeliveries } from '@/lib/db/schema';
import { desc, eq, and, or, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { assertQuota } from '@/lib/billing/quotas.service';
import { WEBHOOK_TEST_EVENT, isKnownWebhookEvent } from './events';

export type CreateWebhookEndpointParams = {
  organizationId: string;
  url: string;
  events: string[];
};

function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(24).toString('base64url');
}

/**
 * Validates a destination URL an organization asked us to POST to.
 *
 * HTTPS is required, and hosts that only resolve inside our own network are
 * refused: the dispatcher runs server-side, so an endpoint pointed at
 * `https://127.0.0.1/...` or a link-local address would turn the webhook feature
 * into a request forger against our own infrastructure.
 */
function assertDispatchableUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'URL du webhook invalide.', 400);
  }

  if (url.protocol !== 'https:') {
    throw new ApiError('VALIDATION_ERROR', 'L’URL du webhook doit utiliser HTTPS.', 400);
  }

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.internal') ||
    host.endsWith('.local');

  if (isPrivate) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'L’URL doit être joignable publiquement : une adresse locale ou privée est refusée.',
      400
    );
  }
}

/**
 * Validates the requested subscription list against the event catalogue.
 *
 * Nothing used to check these names, so an endpoint saved with a typo was
 * accepted and then silently never fired.
 */
function assertKnownEvents(events: string[]): void {
  if (events.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Sélectionnez au moins un événement.', 400);
  }

  const unknown = events.filter((event) => !isKnownWebhookEvent(event));
  if (unknown.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Événements inconnus : ${unknown.join(', ')}.`,
      400
    );
  }
}

/**
 * Fields safe to return: everything but the signing secret.
 *
 * The secret is shown once, at creation and after a rotation, like an API key.
 */
export function serializeWebhookEndpoint<T extends { secret?: string }>(endpoint: T) {
  const { secret: _secret, ...rest } = endpoint;
  return rest;
}

export async function createWebhookEndpoint(
  params: CreateWebhookEndpointParams
): Promise<any> {
  assertDispatchableUrl(params.url);
  assertKnownEvents(params.events);

  // MVP6 quotas: the plan caps how many endpoints an organization may register,
  // and nothing enforced it on this path.
  await assertQuota(params.organizationId, 'maxWebhookEndpoints');

  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId: params.organizationId,
      url: params.url,
      secret: generateWebhookSecret(),
      events: params.events,
      active: true,
      kind: 'generic',
    })
    .returning();

  return endpoint;
}

/**
 * Endpoints belonging to one organization.
 *
 * `n8n_primary` is excluded: it is the platform's own global endpoint, carries
 * no `organization_id`, and is not an organization's to read or change.
 */
export async function listWebhookEndpoints(organizationId: string) {
  return db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.organizationId, organizationId),
        eq(webhookEndpoints.kind, 'generic')
      )
    )
    .orderBy(webhookEndpoints.createdAt);
}

async function loadOwnedEndpoint(endpointId: string, organizationId: string) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.organizationId, organizationId),
        eq(webhookEndpoints.kind, 'generic')
      )
    )
    .limit(1);

  if (!endpoint) {
    throw new ApiError('NOT_FOUND', 'Endpoint webhook introuvable.', 404);
  }

  return endpoint;
}

export async function updateWebhookEndpoint(
  endpointId: string,
  organizationId: string,
  input: { url?: string; events?: string[]; active?: boolean }
) {
  await loadOwnedEndpoint(endpointId, organizationId);

  if (input.url !== undefined) assertDispatchableUrl(input.url);
  if (input.events !== undefined) assertKnownEvents(input.events);

  const [updated] = await db
    .update(webhookEndpoints)
    .set({
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, endpointId))
    .returning();

  return updated;
}

export async function deleteWebhookEndpoint(endpointId: string, organizationId: string) {
  await loadOwnedEndpoint(endpointId, organizationId);

  // `webhook_deliveries.endpoint_id` cascades, so the delivery history goes with
  // it. That is deliberate: a deleted endpoint's history is not addressable.
  const [deleted] = await db
    .delete(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .returning();

  return deleted;
}

/** Issues a new signing secret, returned once. Old signatures stop verifying. */
export async function rotateWebhookSecret(endpointId: string, organizationId: string) {
  await loadOwnedEndpoint(endpointId, organizationId);

  const [updated] = await db
    .update(webhookEndpoints)
    .set({ secret: generateWebhookSecret(), updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, endpointId))
    .returning();

  return updated;
}

/**
 * Sends a signed test event to one endpoint and waits for the result.
 *
 * Unlike `emit()`, this awaits the dispatch: the point is to tell the user
 * immediately whether their consumer answered, and with what status.
 */
export async function sendWebhookTest(endpointId: string, organizationId: string) {
  const endpoint = await loadOwnedEndpoint(endpointId, organizationId);

  const payload = toJsonSafe({
    id: `evt_${crypto.randomBytes(16).toString('hex')}`,
    type: WEBHOOK_TEST_EVENT,
    created: new Date().toISOString(),
    organizationId,
    data: { message: 'Événement de test envoyé depuis Contravo.' },
    apiVersion: 'v1',
  });

  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      endpointId: endpoint.id,
      event: WEBHOOK_TEST_EVENT,
      payload,
      status: 'pending',
      attempts: 0,
    })
    .returning();

  await dispatchDelivery(delivery.id, endpoint.url, endpoint.secret, payload);

  const [result] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, delivery.id))
    .limit(1);

  return result;
}

/** Recent delivery attempts for the organization's own endpoints. */
export async function listWebhookDeliveries(
  organizationId: string,
  options?: { endpointId?: string; status?: string; limit?: number }
) {
  const conditions = [
    eq(webhookEndpoints.organizationId, organizationId),
    eq(webhookEndpoints.kind, 'generic'),
  ];

  if (options?.endpointId) {
    conditions.push(eq(webhookDeliveries.endpointId, options.endpointId));
  }
  if (options?.status) {
    conditions.push(eq(webhookDeliveries.status, options.status));
  }

  return db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      lastResponseCode: webhookDeliveries.lastResponseCode,
      lastResponseBody: webhookDeliveries.lastResponseBody,
      nextRetryAt: webhookDeliveries.nextRetryAt,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
      endpointUrl: webhookEndpoints.url,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(Math.min(options?.limit ?? 50, 200));
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

/**
 * The transaction object drizzle hands to a `db.transaction` callback.
 *
 * Derived from `db` rather than written out: typing it as `any` would silently
 * strip the inference from every `tx.select()` in the repositories.
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A queued delivery, ready to be sent once its transaction has committed. */
export type PendingDispatch = {
  deliveryId: string;
  url: string;
  secret: string;
  payload: any;
};

/**
 * Writes the outbox rows for one event and returns what still has to be sent.
 *
 * Takes the connection to write through, so it can run inside a caller's
 * transaction: the rows then commit — or roll back — atomically with the
 * business write that produced them.
 */
async function queueDeliveries(
  conn: typeof db | DbTransaction,
  event: string,
  organizationId: string | null,
  data: any
): Promise<PendingDispatch[]> {
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
  const endpoints = await conn
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.active, true), scope));

  const matchedEndpoints = endpoints.filter(
    (ep: typeof webhookEndpoints.$inferSelect) =>
      ep.events.includes(event) || ep.events.includes('*')
  );

  const pending: PendingDispatch[] = [];

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

    const [delivery] = await conn
      .insert(webhookDeliveries)
      .values({
        endpointId: ep.id,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      })
      .returning();

    pending.push({ deliveryId: delivery.id, url: ep.url, secret: ep.secret, payload });
  }

  return pending;
}

/** Fires queued deliveries in the background, never throwing at the caller. */
export function dispatchPending(pending: PendingDispatch[]): void {
  for (const item of pending) {
    dispatchDelivery(item.deliveryId, item.url, item.secret, item.payload).catch((err) => {
      console.error(`Error dispatching webhook delivery ${item.deliveryId}:`, err);
    });
  }
}

/**
 * Queues an event and sends it immediately.
 *
 * Correct for call sites that are *not* inside a transaction. Inside one, use
 * {@link withOutbox} instead — see the note there for what goes wrong otherwise.
 */
export async function emit(
  event: string,
  organizationId: string | null,
  data: any
): Promise<void> {
  const pending = await queueDeliveries(db, event, organizationId, data);
  dispatchPending(pending);
}

/** Collects events raised inside a transaction. */
export type Outbox = {
  emit(event: string, organizationId: string | null, data: any): Promise<void>;
};

/**
 * Runs a transaction whose events are queued with it and sent after it commits.
 *
 * `emit()` used to be called from inside `db.transaction()` while writing
 * through the *global* connection, which produced three distinct faults:
 *
 * 1. The delivery row landed outside the transaction. A business write that
 *    rolled back afterwards still left a queued — and already sent — webhook for
 *    an entity that never existed.
 * 2. `dispatchDelivery` fired before the commit, so a consumer could call back
 *    and read the entity before it was visible. n8n fetching a quote it had just
 *    been told about, and getting a 404, is that race.
 * 3. Anything thrown while building or inserting the event aborted the business
 *    transaction. A `bigint` in a payload once rolled back the invoice that
 *    caused it.
 *
 * @example
 * return withOutbox(async (tx, outbox) => {
 *   const [row] = await tx.insert(quotes).values(...).returning();
 *   await outbox.emit('quote.created', organizationId, { quote: row });
 *   return row;
 * });
 */
export async function withOutbox<T>(
  fn: (tx: DbTransaction, outbox: Outbox) => Promise<T>
): Promise<T> {
  const pending: PendingDispatch[] = [];

  const result = await db.transaction(async (tx) => {
    const outbox: Outbox = {
      async emit(event, organizationId, data) {
        pending.push(...(await queueDeliveries(tx, event, organizationId, data)));
      },
    };

    return fn(tx, outbox);
  });

  // Only now is what the consumer will come back to read actually visible.
  dispatchPending(pending);

  return result;
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
