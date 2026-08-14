import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * Covers POST /api/v1/webhooks/verify — the endpoint n8n calls because its Code
 * node sandbox forbids crypto/process.env, so it cannot verify HMAC itself.
 */

const SECRET = 'whsec_testsecret';

const endpointRows: Array<{ id: string; secret: string }> = [
  { id: 'wep_1', secret: SECRET },
];

let apiContext: { organizationId: string; authType: string; scopes: string[] } | null = null;
let scopeError: Error | null = null;

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => endpointRows,
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  webhookEndpoints: { kind: 'kind', active: 'active', secret: 'secret', id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimitIp: async () => ({ allowed: true, limit: 500, remaining: 499, reset: 0 }),
}));

vi.mock('@/lib/auth/unified-auth', () => ({
  getApiContext: async () => {
    if (!apiContext) throw new Error('unauthenticated');
    return apiContext;
  },
  checkScope: () => {
    if (scopeError) throw scopeError;
  },
}));

const { POST } = await import('../../app/api/v1/webhooks/verify/route');

function sign(secret: string, timestamp: number, body: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

function makeRequest(body: unknown) {
  return new Request('https://app.test/api/v1/webhooks/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/v1/webhooks/verify', () => {
  const payload = { id: 'evt_1', type: 'quote.sent', organizationId: 'org_1', data: {} };
  const rawBody = JSON.stringify(payload);

  beforeEach(() => {
    apiContext = { organizationId: 'org_1', authType: 'api_key', scopes: ['webhooks:manage'] };
    scopeError = null;
    endpointRows.length = 0;
    endpointRows.push({ id: 'wep_1', secret: SECRET });
  });

  it('returns valid:true and the parsed payload for a good signature', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest({ signature: sign(SECRET, ts, rawBody), rawBody }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.valid).toBe(true);
    expect(json.event).toBe('quote.sent');
    expect(json.payload).toEqual(payload);
  });

  it('returns valid:false (not an error status) for a tampered body', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = sign(SECRET, ts, rawBody);
    const res = await POST(makeRequest({ signature, rawBody: rawBody.replace('evt_1', 'evt_2') }));

    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(false);
  });

  it('returns valid:false for a signature made with the wrong secret', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest({ signature: sign('whsec_other', ts, rawBody), rawBody }));

    expect((await res.json()).valid).toBe(false);
  });

  it('returns valid:false for a replayed (expired) timestamp', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 400;
    const res = await POST(makeRequest({ signature: sign(SECRET, oldTs, rawBody), rawBody }));

    expect((await res.json()).valid).toBe(false);
  });

  it('rejects an unauthenticated caller', async () => {
    apiContext = null;
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest({ signature: sign(SECRET, ts, rawBody), rawBody }));

    expect(res.status).toBe(401);
  });

  it('rejects a caller missing the webhooks:manage scope', async () => {
    const { ApiError } = await import('../../lib/rbac');
    scopeError = new ApiError('PERMISSION_DENIED', 'Insufficient scope', 403);

    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest({ signature: sign(SECRET, ts, rawBody), rawBody }));

    expect(res.status).toBe(403);
  });

  it('returns 400 when rawBody is missing', async () => {
    const res = await POST(makeRequest({ signature: 't=1,v1=abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when no n8n endpoint is configured', async () => {
    endpointRows.length = 0;
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest({ signature: sign(SECRET, ts, rawBody), rawBody }));

    expect(res.status).toBe(503);
  });
});
