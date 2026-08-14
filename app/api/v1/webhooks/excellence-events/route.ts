import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { webhookEndpoints } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { rateLimitIp } from '@/lib/rate-limit';
import { isDuplicateEvent } from '@/lib/notifications/redis-idempotency';
import { verifyN8nSignature, parseN8nPayload } from '@/lib/notifications/webhook-verify';

/**
 * Receives Excellence → n8n webhook events on the single public endpoint.
 *
 * Responsibilities (MVP5 §2.3, §6):
 *  - Rate limit per IP (500/min).
 *  - Verify HMAC signature + 5-minute timestamp window using the primary n8n endpoint secret.
 *  - Enforce idempotency via event.id (Redis, 24h) so replays produce a single side effect.
 *
 * This route only acknowledges reception. The actual orchestration (email/cron/notify)
 * is performed by n8n, which calls back into the Excellence API using its scoped API key.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  const rateLimitResult = await rateLimitIp(ip, 500);
  if (!rateLimitResult.allowed) {
    return new NextResponse(
      JSON.stringify({ error: 'rate_limit_exceeded', message: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(
      JSON.stringify({ error: 'bad_request', message: 'Could not read body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const signature = request.headers.get('x-webhook-signature');
  const eventType = request.headers.get('x-webhook-event') || '';

  // Resolve the primary n8n endpoint (global: organization_id IS NULL).
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.kind, 'n8n_primary'),
        eq(webhookEndpoints.active, true)
      )
    )
    .limit(1);

  if (endpoints.length === 0) {
    return new NextResponse(
      JSON.stringify({ error: 'not_configured', message: 'No n8n endpoint configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const endpoint = endpoints[0];

  if (!verifyN8nSignature(signature, rawBody, endpoint.secret)) {
    return new NextResponse(
      JSON.stringify({ error: 'invalid_signature', message: 'Signature verification failed' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let payload: ReturnType<typeof parseN8nPayload>;
  try {
    payload = parseN8nPayload(rawBody);
  } catch {
    return new NextResponse(
      JSON.stringify({ error: 'bad_request', message: 'Invalid JSON payload' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!payload.id) {
    return new NextResponse(
      JSON.stringify({ error: 'bad_request', message: 'Missing event id' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Idempotency: duplicate event id => acknowledge without re-processing.
  if (await isDuplicateEvent(payload.id)) {
    return new NextResponse(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Touch endpoint updatedAt so we know it is alive.
  await db
    .update(webhookEndpoints)
    .set({ updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, endpoint.id));

  return new NextResponse(
    JSON.stringify({
      received: true,
      id: payload.id,
      type: payload.type || eventType,
      organizationId: payload.organizationId,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
