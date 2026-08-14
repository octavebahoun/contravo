import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyN8nSignature, parseN8nPayload, N8N_TIMESTAMP_WINDOW_SECONDS } from '../../lib/notifications/webhook-verify';

function sign(secret: string, timestamp: number, body: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

describe('verifyN8nSignature', () => {
  const secret = 'whsec_testsecret';
  const body = JSON.stringify({ id: 'evt_1', type: 'quote.sent' });
  const now = Math.floor(Date.now() / 1000);

  it('accepts a valid signature within the timestamp window', () => {
    const sig = sign(secret, now, body);
    expect(verifyN8nSignature(sig, body, secret)).toBe(true);
  });

  it('rejects a missing signature header', () => {
    expect(verifyN8nSignature(null, body, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(secret, now, body);
    expect(verifyN8nSignature(sig, body + 'x', secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = sign(secret, now, body);
    expect(verifyN8nSignature(sig, body, 'whsec_other')).toBe(false);
  });

  it('rejects an expired timestamp (beyond 5 min window)', () => {
    const oldTs = now - (N8N_TIMESTAMP_WINDOW_SECONDS + 10);
    const sig = sign(secret, oldTs, body);
    expect(verifyN8nSignature(sig, body, secret)).toBe(false);
  });

  it('rejects a future timestamp (beyond 5 min window)', () => {
    const futureTs = now + (N8N_TIMESTAMP_WINDOW_SECONDS + 10);
    const sig = sign(secret, futureTs, body);
    expect(verifyN8nSignature(sig, body, secret)).toBe(false);
  });

  it('rejects malformed signature header', () => {
    expect(verifyN8nSignature('garbage', body, secret)).toBe(false);
  });
});

describe('parseN8nPayload', () => {
  it('parses a standard payload', () => {
    const raw = JSON.stringify({
      id: 'evt_123',
      type: 'contract.signed',
      organizationId: 'org_1',
      data: { foo: 'bar' },
    });
    const p = parseN8nPayload(raw);
    expect(p.id).toBe('evt_123');
    expect(p.type).toBe('contract.signed');
    expect(p.organizationId).toBe('org_1');
    expect(p.data).toEqual({ foo: 'bar' });
  });

  it('returns null organizationId when absent', () => {
    const raw = JSON.stringify({ id: 'evt_2', type: 'invoice.paid' });
    const p = parseN8nPayload(raw);
    expect(p.organizationId).toBeNull();
    expect(p.data).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseN8nPayload('not json')).toThrow();
  });
});
