import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { webhookEndpoints } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { rateLimitIp } from '@/lib/rate-limit';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { verifyN8nSignature, parseN8nPayload } from '@/lib/notifications/webhook-verify';

/**
 * Verifies an Excellence webhook signature on behalf of n8n.
 *
 * n8n Code nodes run in a sandbox where `require('crypto')`, `process.env` and the
 * expression helper `hmac()` are all unavailable, so the router cannot compute the
 * HMAC itself. It POSTs the verbatim body and signature here instead; the secret
 * never leaves Excellence and the comparison stays timing-safe.
 *
 * Request body:
 *   { signature: string, rawBody: string }
 *
 * Response 200: { valid, event?, payload? } — `valid: false` is a normal answer,
 * not an error, so the router can branch on it rather than on a status code.
 *
 * Requires the n8n API key (`webhooks:manage`): without it this route would be an
 * open signature oracle backed by a DB read.
 *
 * @see lib/notifications/webhook-verify.ts for the signing scheme.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  try {
    const context = await getApiContext();
    checkScope(context, 'webhooks:manage');
  } catch (error) {
    return formatErrorResponse(
      error instanceof ApiError
        ? error
        : new ApiError('UNAUTHENTICATED', 'Authentication required', 401),
      requestId
    );
  }

  const rateLimitResult = await rateLimitIp(ip, 500);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  let body: { signature?: unknown; rawBody?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const signature = typeof body.signature === 'string' ? body.signature : null;
  const rawBody = typeof body.rawBody === 'string' ? body.rawBody : null;

  if (rawBody === null) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Missing rawBody' },
      { status: 400 }
    );
  }

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.kind, 'n8n_primary'), eq(webhookEndpoints.active, true))
    )
    .limit(1);

  if (endpoints.length === 0) {
    return NextResponse.json(
      { error: 'not_configured', message: 'No n8n endpoint configured' },
      { status: 503 }
    );
  }

  if (!verifyN8nSignature(signature, rawBody, endpoints[0].secret)) {
    return NextResponse.json({ valid: false });
  }

  // Signature is valid: hand the router the parsed payload so it can dispatch
  // without re-parsing (and without trusting a body it parsed before verifying).
  let payload: ReturnType<typeof parseN8nPayload>;
  try {
    payload = parseN8nPayload(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    valid: true,
    event: payload.type,
    payload: JSON.parse(rawBody),
  });
}
