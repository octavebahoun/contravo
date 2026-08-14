import crypto from 'crypto';

/** Allowed clock skew (seconds) for inbound n8n webhook timestamps (MVP5 §6). */
export const N8N_TIMESTAMP_WINDOW_SECONDS = 5 * 60;

/**
 * Verifies the `X-Webhook-Signature` header of an inbound Excellence ← n8n event.
 *
 * Format is Stripe-like: `t=<unix>,v1=<hex>` where the HMAC-SHA256 is computed
 * over `<timestamp>.<rawBody>` using the endpoint HMAC secret. Matches exactly the
 * signing scheme Excellence uses to emit webhooks (lib/webhooks signPayload).
 *
 * @param signatureHeader - Raw `X-Webhook-Signature` header value.
 * @param rawBody - Verbatim request body string.
 * @param secret - HMAC secret of the target webhook endpoint.
 * @returns `true` when signature is valid and within the timestamp window.
 */
export function verifyN8nSignature(
  signatureHeader: string | null,
  rawBody: string,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  let timestamp: string | undefined;
  let v1: string | undefined;
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') v1 = value;
  }
  if (!timestamp || !v1) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > N8N_TIMESTAMP_WINDOW_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Parses the standard Excellence webhook payload body.
 *
 * @param rawBody - Verbatim request body string.
 * @returns Parsed payload with id/type/organizationId/data.
 * @throws Error when the body is not valid JSON.
 */
export function parseN8nPayload(rawBody: string): {
  id: string;
  type: string;
  organizationId: string | null;
  data: unknown;
} {
  const parsed = JSON.parse(rawBody) as {
    id?: unknown;
    type?: unknown;
    organizationId?: unknown;
    data?: unknown;
  };
  return {
    id: typeof parsed.id === 'string' ? parsed.id : '',
    type: typeof parsed.type === 'string' ? parsed.type : '',
    organizationId:
      typeof parsed.organizationId === 'string' ? parsed.organizationId : null,
    data: parsed.data ?? null,
  };
}
