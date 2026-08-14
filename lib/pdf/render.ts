import crypto from 'crypto';
import type { ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';

/**
 * Renders a React-PDF document to a deterministic buffer (MVP4 §6.3).
 *
 * React-PDF stamps `/CreationDate` and `/ModDate` into the PDF trailer from the
 * wall clock, and emits a random `/ID` pair. Left alone, two renders of the same
 * quote produce different bytes and therefore different SHA-256 values, which
 * would break the signature proof chain (§7.3). We normalise all three to fixed
 * values derived from the document itself.
 */

/** Fixed epoch stamped into every generated PDF (2000-01-01T00:00:00Z). */
const FIXED_PDF_DATE = 'D:20000101000000Z';

/**
 * Rewrites every PDF date literal to a constant.
 *
 * React-PDF emits the timestamp as an *indirect* object (`16 0 obj (D:2026…)`)
 * rather than inline in the Info dictionary, so matching on `/CreationDate (…)`
 * misses it. Matching the `D:YYYYMMDDHHmmSS` literal itself catches both forms.
 *
 * Operates on the raw bytes with a latin1 view: PDF syntax is ASCII, and latin1
 * round-trips every byte value unchanged, so binary streams are preserved.
 */
function normalizeDates(buffer: Buffer): Buffer {
  const text = buffer.toString('latin1');
  const normalized = text
    .replace(/D:\d{14}(?:[Zz]|[+-]\d{2}'\d{2}')?/g, FIXED_PDF_DATE)
    .replace(
      /\/(CreationDate|ModDate)\s*\(([^)]*)\)/g,
      (_match, key: string) => `/${key} (${FIXED_PDF_DATE})`
    );
  return Buffer.from(normalized, 'latin1');
}

/**
 * Replaces the trailer `/ID` array with a digest of the document body.
 *
 * The ID must stay a valid 2-element array of equal-length hex strings; deriving
 * it from the content keeps it stable across renders while remaining unique per
 * document.
 */
function normalizeTrailerId(buffer: Buffer): Buffer {
  const text = buffer.toString('latin1');
  const idPattern = /\/ID\s*\[\s*<([0-9A-Fa-f]*)>\s*<([0-9A-Fa-f]*)>\s*\]/;
  const match = text.match(idPattern);
  if (!match) return buffer;

  // Digest the document with the volatile ID removed, so the ID depends only
  // on stable content.
  const withoutId = text.replace(idPattern, '');
  const digest = crypto
    .createHash('sha256')
    .update(withoutId, 'latin1')
    .digest('hex')
    .slice(0, match[1].length || 32)
    .toUpperCase();

  return Buffer.from(text.replace(idPattern, `/ID [<${digest}> <${digest}>]`), 'latin1');
}

/**
 * Renders a document element to a byte-stable PDF buffer.
 *
 * @param element - A `<Document>` element from a versioned template.
 * @returns PDF bytes; identical input yields an identical buffer.
 */
export async function renderPdf(
  element: ReactElement<DocumentProps>
): Promise<Buffer> {
  const raw = await renderToBuffer(element);
  return normalizeTrailerId(normalizeDates(Buffer.from(raw)));
}

/**
 * Computes the SHA-256 hex digest used for file integrity and signature proofs.
 */
export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
