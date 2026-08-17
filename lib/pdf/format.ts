import { formatMoney as formatSharedMoney } from '@/lib/money';
import type { PdfAddress } from './types';

/**
 * Deterministic formatting helpers for PDF templates (MVP4 §6.3).
 *
 * Every function here is pure: same input, same output, on any machine. In
 * particular none of them read the clock or the ambient locale — a document
 * re-rendered a year later must hash identically.
 */

/**
 * Formats a stored minor-unit amount for a PDF.
 *
 * Delegates to the shared money formatter so the PDF, the portal and the
 * dashboard cannot drift apart again. It used to divide by 100 for every
 * currency: **a 25 000 XOF invoice printed "250,00 XOF"** on the very document
 * attached to the client's email. `lib/money.ts` is deterministic and
 * `Intl`-free, which is what this module requires.
 *
 * @param cents - Amount in the currency's minor unit, as stored.
 * @param currency - ISO code appended after the number (e.g. `XOF`).
 */
export const formatMoney = formatSharedMoney;

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
