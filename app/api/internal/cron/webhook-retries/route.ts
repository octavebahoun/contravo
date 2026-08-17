import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { retryDueDeliveries } from '@/lib/webhooks';
import { rateLimitIp } from '@/lib/rate-limit';

/**
 * Redelivers webhooks whose retry is due (MVP5 §6).
 *
 * Lives outside `/api/v1` on purpose: the v1 middleware resolves an organization
 * from the caller's credentials, and this sweep is platform-wide, belonging to no
 * tenant. It is therefore not covered by that middleware and authenticates
 * itself with a shared secret below.
 *
 * Driven by the n8n Schedule workflow `cron_webhook_retries_v1.json` (every
 * 5 minutes). Safe to call concurrently: `retryDueDeliveries` leases the rows it
 * claims.
 */

/**
 * Constant-time bearer check.
 *
 * `timingSafeEqual` throws on length mismatch, so both sides are hashed to a
 * fixed width first — that also keeps the comparison from leaking the secret's
 * length.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Fail closed: an unset secret must not mean an open endpoint.
  if (!expected) {
    console.error('CRON_SECRET is not set — refusing to run the webhook retry sweep.');
    return false;
  }

  const header = request.headers.get('authorization') || '';
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!provided) return false;

  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  const rateLimitResult = await rateLimitIp(ip, 60);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      { status: 429 }
    );
  }

  if (!isAuthorized(request)) {
    // Deliberately uninformative: this endpoint should not help an attacker
    // distinguish "no secret configured" from "wrong secret".
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const result = await retryDueDeliveries();

    if (result.claimed > 0) {
      console.log(
        `Webhook retry sweep: claimed=${result.claimed} dispatched=${result.dispatched} failures=${result.failures}`
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Webhook retry sweep failed:', error);
    return NextResponse.json(
      { error: 'internal_server_error', message: 'Retry sweep failed' },
      { status: 500 }
    );
  }
}
