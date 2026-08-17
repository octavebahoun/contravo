import { describe, it, expect } from 'vitest';
import { toJsonSafe } from '../../lib/webhooks';

/**
 * Guards the *encoding* of webhook payloads.
 *
 * `event-coverage.test.ts` checks which events exist by grepping the sources; it
 * never builds a payload, so it could not catch the bug where drizzle's `bigint`
 * money columns made `JSON.stringify` throw inside the `db.transaction()` of
 * `createQuote`/`createInvoice` and rolled the business write back (500 on
 * `POST /api/v1/quotes` and `/invoices`).
 *
 * The contract asserted here: money crosses the wire as a decimal string, the
 * same type `app/api/v1/quotes/route.ts` and `app/api/v1/invoices/route.ts`
 * return for those columns.
 */

/** Money columns drizzle returns as `bigint` on quote and invoice rows. */
const MONEY_FIELDS = [
  'subtotalCents',
  'discountCents',
  'taxCents',
  'totalCents',
  'amountPaidCents',
  'amountDueCents',
] as const;

/** Shape of a row as the repositories hand it to `emit()`. */
function quoteRowFixture() {
  return {
    id: '7b0e4d3a-0000-4000-8000-000000000001',
    number: 'DEV-2026-0001',
    status: 'draft',
    currency: 'XOF',
    subtotalCents: 300000n,
    discountCents: 0n,
    taxCents: 54000n,
    totalCents: 354000n,
    validUntil: null,
    createdAt: new Date('2026-08-17T10:00:00.000Z'),
    deletedAt: undefined,
    items: [
      { id: 'item-1', description: 'Développement', quantity: 1, unitPriceCents: 300000n, amountCents: 300000n },
      { id: 'item-2', description: 'Design', quantity: 2, unitPriceCents: 27000n, amountCents: 54000n },
    ],
  };
}

function invoiceRowFixture() {
  return {
    id: '7b0e4d3a-0000-4000-8000-000000000002',
    number: 'FAC-2026-0001',
    status: 'sent',
    currency: 'XOF',
    subtotalCents: 300000n,
    discountCents: 0n,
    taxCents: 54000n,
    totalCents: 354000n,
    amountPaidCents: 0n,
    amountDueCents: 354000n,
    issueDate: '2026-08-17',
    createdAt: new Date('2026-08-17T10:00:00.000Z'),
  };
}

/** The envelope `emit()` wraps around the caller's `data`. */
function envelope(data: unknown) {
  return toJsonSafe({
    id: 'evt_0123456789abcdef',
    type: 'quote.created',
    created: new Date('2026-08-17T10:00:00.000Z').toISOString(),
    organizationId: '7b0e4d3a-0000-4000-8000-0000000000ff',
    data,
    apiVersion: 'v1',
  }) as Record<string, any>;
}

describe('Webhook payload encoding', () => {
  it('serializes a quote row carrying bigints, the case that returned 500', () => {
    // Anti-vacuity: the fixture must really carry bigints, otherwise every
    // assertion below would still pass with the normalizer removed.
    expect(() => JSON.stringify({ quote: quoteRowFixture() })).toThrow(TypeError);

    const payload = envelope({ quote: quoteRowFixture() });

    // The assertion that matters: this threw before toJsonSafe existed, both on
    // the jsonb insert (postgres.js stringifies) and on the HTTP body.
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('serializes an invoice row carrying bigints', () => {
    const payload = envelope({ invoice: invoiceRowFixture() });
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('encodes money as decimal strings, matching what the API returns', () => {
    const quote = envelope({ quote: quoteRowFixture() }).data.quote;

    for (const field of MONEY_FIELDS) {
      if (quote[field] === undefined) continue;
      expect(typeof quote[field], `${field} must be a decimal string`).toBe('string');
    }

    expect(quote.totalCents).toBe('354000');
    expect(quote.subtotalCents).toBe('300000');
    expect(quote.discountCents).toBe('0');
  });

  it('encodes money inside nested line items too', () => {
    const items = envelope({ quote: quoteRowFixture() }).data.quote.items;

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(typeof item.unitPriceCents).toBe('string');
      expect(typeof item.amountCents).toBe('string');
    }
    expect(items[0].unitPriceCents).toBe('300000');
    expect(items[1].amountCents).toBe('54000');
  });

  it('keeps precision a Number conversion would lose', () => {
    // 2^53 + 1. Note the literal cannot be written as a number here — the source
    // itself would round it — which is precisely the hazard being guarded.
    const encoded = toJsonSafe({ amountCents: 9007199254740993n }) as { amountCents: string };

    expect(encoded.amountCents).toBe('9007199254740993');
    // Round-tripping through Number silently drops the last digit.
    expect(String(Number(encoded.amountCents))).toBe('9007199254740992');
  });

  it('encodes dates as ISO 8601', () => {
    const quote = envelope({ quote: quoteRowFixture() }).data.quote;
    expect(quote.createdAt).toBe('2026-08-17T10:00:00.000Z');
  });

  it('keeps JSON.stringify semantics for null and undefined', () => {
    const encoded = toJsonSafe({
      kept: null,
      dropped: undefined,
      list: [1, undefined, null],
    }) as Record<string, any>;

    expect(encoded.kept).toBeNull();
    expect('dropped' in encoded).toBe(false);
    expect(encoded.list).toEqual([1, null, null]);
  });

  it('recurses through arrays and nested objects', () => {
    const encoded = toJsonSafe({
      level1: { level2: { level3: [{ totalCents: 42n }] } },
    }) as any;

    expect(encoded.level1.level2.level3[0].totalCents).toBe('42');
  });

  it('produces a payload that round-trips through JSON unchanged', () => {
    // The same object feeds the jsonb column, signPayload() and the HTTP body:
    // if these three could diverge, the HMAC signature would not verify.
    const payload = envelope({ quote: quoteRowFixture(), invoice: invoiceRowFixture() });
    const body = JSON.stringify(payload);

    expect(JSON.parse(body)).toEqual(payload);
    expect(JSON.stringify(JSON.parse(body))).toBe(body);
  });
});
