import type { PdfAddress } from './types';

/**
 * Deterministic formatting helpers for PDF templates (MVP4 §6.3).
 *
 * Every function here is pure: same input, same output, on any machine. In
 * particular none of them read the clock or the ambient locale — a document
 * re-rendered a year later must hash identically.
 */

/**
 * Formats a cents amount using a fixed fr-FR-like convention.
 *
 * Implemented manually rather than via `Intl.NumberFormat` because ICU data
 * differs between Node builds, which would break byte-for-byte determinism.
 *
 * @param cents - Amount in minor units.
 * @param currency - ISO code appended after the number (e.g. `XOF`).
 */
export function formatMoney(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const units = Math.floor(abs / 100);
  const decimals = abs % 100;

  // Plain U+0020 as the thousands separator: the narrow no-break space (U+202F)
  // is missing from the standard PDF Helvetica font and renders as a stray glyph.
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body = `${grouped},${String(decimals).padStart(2, '0')}`;

  return `${negative ? '-' : ''}${body} ${currency}`;
}

/**
 * Formats a basis-points rate as a percentage (1250 → "12,5 %").
 */
export function formatBps(bps: number): string {
  const percent = bps / 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${String(rounded).replace('.', ',')} %`;
}

/**
 * Formats a stored date as DD/MM/YYYY in UTC.
 *
 * UTC is deliberate: rendering on a server in another timezone must not shift
 * the printed day.
 *
 * @param value - Date or ISO string from the database; nullish yields ''.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * Flattens an address JSON blob into printable lines, skipping empty parts.
 */
export function formatAddress(address: PdfAddress | null | undefined): string[] {
  if (!address) return [];

  const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [address.line1, address.line2, cityLine, address.country]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0);
}

/**
 * Formats a quantity, trimming trailing zeros from numeric strings ("2.00" → "2").
 */
export function formatQuantity(quantity: string): string {
  const trimmed = quantity.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;

  const normalized = trimmed.includes('.')
    ? trimmed.replace(/0+$/, '').replace(/\.$/, '')
    : trimmed;
  return normalized.replace('.', ',');
}
