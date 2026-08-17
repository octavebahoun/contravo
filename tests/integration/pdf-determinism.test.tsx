import { describe, it, expect } from 'vitest';
import { QuoteDocument } from '../../lib/pdf/templates/quote-v1';
import { InvoiceDocument } from '../../lib/pdf/templates/invoice-v1';
import { ContractDocument } from '../../lib/pdf/templates/contract-v1';
import { renderPdf, sha256 } from '../../lib/pdf/render';
import { formatMoney, formatBps, formatDate, formatQuantity } from '../../lib/pdf/format';
import { parseMarkdown } from '../../lib/pdf/markdown';
import { computeSignatureHash } from '../../lib/signatures/sign.service';
import type { ContractPdfData, InvoicePdfData, QuotePdfData } from '../../lib/pdf/types';

/**
 * Determinism is the load-bearing property of MVP4 §6.3: signature proofs
 * (§7.3) hash the rendered document, so a re-render that differs by a byte
 * would invalidate evidence already handed to a counterparty.
 */

const org = {
  name: 'Contravo',
  brandColor: '#2B6CE5',
  legalMentions: 'SARL — RCCM BJ-COT-01-2026',
  email: null,
  phone: null,
  address: null,
  logoDataUri: null,
  bankDetails: { iban: 'BJ66 1234 5678', bic: 'ECOCBJBJ' },
};

const client = {
  displayName: 'ACME SARL',
  companyName: 'ACME SARL',
  email: 'client@acme.tld',
  phone: null,
  vatNumber: 'BJ123456',
  address: { line1: '5 avenue Steinmetz', city: 'Cotonou', country: 'Bénin' },
};

const items = [
  {
    position: 1,
    description: 'Conception UI/UX',
    quantity: '2.00',
    unit: 'j',
    unitPriceCents: 15000000,
    discountBps: 0,
    amountCents: 30000000,
  },
  {
    position: 2,
    description: 'Développement API',
    quantity: '5.5',
    unit: 'j',
    unitPriceCents: 20000000,
    discountBps: 1000,
    amountCents: 99000000,
  },
];

const totals = {
  currency: 'XOF',
  subtotalCents: 129000000,
  discountCents: 11000000,
  taxRateBps: 1800,
  taxCents: 21240000,
  totalCents: 139240000,
};

const quoteData: QuotePdfData = {
  org,
  client,
  number: 'DEV-2026-0001',
  issueDate: '14/08/2026',
  validUntil: '14/09/2026',
  items,
  totals,
  notes: 'Merci de votre confiance.',
  terms: 'Acompte de 40% à la commande.',
};

const invoiceData: InvoicePdfData = {
  org,
  client,
  number: 'FAC-2026-0001',
  issueDate: '14/08/2026',
  dueDate: '14/09/2026',
  items,
  totals,
  notes: null,
};

const contractData: ContractPdfData = {
  org,
  client,
  number: 'CTR-2026-0001',
  title: 'Contrat de prestation',
  issueDate: '14/08/2026',
  contractId: '8f14e45f-ceea-467a-9e6a-1d0f5a2b3c4d',
  bodyMarkdown: '# Préambule\n\nLe **Prestataire** intervient.\n\n- Point A\n- Point B',
  signature: null,
};

/** Renders n times with a gap, so a clock-derived field cannot hide. */
async function hashesOf(
  render: () => Promise<Buffer>,
  times: number
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < times; i++) {
    out.push(sha256(await render()));
    if (i < times - 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}

describe('PDF determinism (MVP4 §6.3)', () => {
  it('renders the same quote to an identical SHA-256 five times', async () => {
    const hashes = await hashesOf(() => renderPdf(<QuoteDocument data={quoteData} />), 5);
    expect(new Set(hashes).size).toBe(1);
  }, 60000);

  it('renders the same invoice to an identical SHA-256', async () => {
    const hashes = await hashesOf(() => renderPdf(<InvoiceDocument data={invoiceData} />), 2);
    expect(new Set(hashes).size).toBe(1);
  }, 30000);

  it('renders the same contract to an identical SHA-256', async () => {
    const hashes = await hashesOf(() => renderPdf(<ContractDocument data={contractData} />), 2);
    expect(new Set(hashes).size).toBe(1);
  }, 30000);

  it('freezes every embedded PDF date', async () => {
    const buffer = await renderPdf(<QuoteDocument data={quoteData} />);
    const dates = [...buffer.toString('latin1').matchAll(/D:\d{14}/g)].map((m) => m[0]);

    expect(dates.length).toBeGreaterThan(0);
    expect(new Set(dates)).toEqual(new Set(['D:20000101000000']));
  }, 30000);

  it('produces different hashes for different content', async () => {
    const a = sha256(await renderPdf(<QuoteDocument data={quoteData} />));
    const b = sha256(
      await renderPdf(<QuoteDocument data={{ ...quoteData, number: 'DEV-2026-0002' }} />)
    );
    expect(a).not.toBe(b);
  }, 30000);

  it('adds a certificate page once signed', async () => {
    const unsigned = await renderPdf(<ContractDocument data={contractData} />);
    const signed = await renderPdf(
      <ContractDocument
        data={{
          ...contractData,
          signature: {
            signerName: 'Jean Dupont',
            signerEmail: 'client@acme.tld',
            signerIp: '196.28.10.4',
            signedAt: '2026-08-14T02:30:00.000Z',
            documentSha256: 'a'.repeat(64),
            signatureSha256: 'b'.repeat(64),
            signatureImageDataUri: null,
          },
        }}
      />
    );

    expect(sha256(signed)).not.toBe(sha256(unsigned));
    expect(signed.length).toBeGreaterThan(unsigned.length);
  }, 30000);
});

describe('PDF formatting helpers', () => {
  it('groups thousands without narrow spaces (missing from Helvetica)', () => {
    expect(formatMoney(129000000, 'XOF')).toBe('129 000 000 XOF');
    expect(formatMoney(129000000, 'XOF')).not.toMatch(/\u202f/);
  });

  it('does not divide a currency that has no minor unit', () => {
    // This expectation used to read '250,00 XOF': the PDF attached to every
    // invoice email printed a hundredth of the real amount.
    expect(formatMoney(25000, 'XOF')).toBe('25 000 XOF');
  });

  it('formats zero and negative amounts', () => {
    expect(formatMoney(0, 'EUR')).toBe('0,00 EUR');
    expect(formatMoney(-50050, 'EUR')).toBe('-500,50 EUR');
    expect(formatMoney(0, 'XOF')).toBe('0 XOF');
    expect(formatMoney(-25000, 'XOF')).toBe('-25 000 XOF');
  });

  it('formats rates from basis points', () => {
    expect(formatBps(1800)).toBe('18 %');
    expect(formatBps(1250)).toBe('12,5 %');
  });

  it('formats dates in UTC so the printed day never shifts', () => {
    expect(formatDate('2026-03-09T23:30:00.000Z')).toBe('09/03/2026');
    expect(formatDate(null)).toBe('');
  });

  it('trims trailing zeros from quantities', () => {
    expect(formatQuantity('2.00')).toBe('2');
    expect(formatQuantity('5.5')).toBe('5,5');
  });
});

describe('Markdown parsing for contract bodies', () => {
  it('parses headings, lists, quotes and rules', () => {
    const blocks = parseMarkdown('# T\n\n- a\n- b\n\n1. x\n2. y\n\n> note\n\n---\n\npara');
    const types = blocks.map((b) => b.type);

    expect(types).toEqual([
      'heading',
      'listItem',
      'listItem',
      'listItem',
      'listItem',
      'quote',
      'rule',
      'paragraph',
    ]);
  });

  it('numbers ordered list items', () => {
    const ordered = parseMarkdown('1. x\n2. y').filter(
      (b): b is Extract<typeof b, { type: 'listItem' }> => b.type === 'listItem'
    );
    expect(ordered.map((b) => b.index)).toEqual([1, 2]);
  });

  it('strips inline emphasis rather than leaking markers', () => {
    const [block] = parseMarkdown('Le **gras** et l\'*italique*.');
    expect(block).toMatchObject({ type: 'paragraph', text: "Le gras et l'italique." });
  });
});

describe('Signature proof hash (MVP4 §7.2)', () => {
  const email = 'client@acme.tld';
  const ts = '2026-08-14T02:30:00.000Z';
  const doc = 'a'.repeat(64);

  it('is stable for identical inputs', () => {
    expect(computeSignatureHash(email, ts, doc)).toBe(computeSignatureHash(email, ts, doc));
  });

  it('changes when any component changes', () => {
    const base = computeSignatureHash(email, ts, doc);
    expect(computeSignatureHash('other@acme.tld', ts, doc)).not.toBe(base);
    expect(computeSignatureHash(email, '2026-08-14T02:30:01.000Z', doc)).not.toBe(base);
    expect(computeSignatureHash(email, ts, 'b'.repeat(64))).not.toBe(base);
  });

  it('produces a 64-character hex digest', () => {
    expect(computeSignatureHash(email, ts, doc)).toMatch(/^[0-9a-f]{64}$/);
  });
});
