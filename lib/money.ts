/**
 * Money formatting, shared by every surface that shows an amount.
 *
 * ## The convention, stated once
 *
 * Business documents (invoices, quotes, projects, expenses) store amounts in
 * the **minor unit of their currency**, in columns named `*_cents`. For a
 * currency that has no minor unit — XOF, the default here — the minor unit *is*
 * the franc: `25000` means 25 000 XOF, not 250. ISO 4217 gives XOF an exponent
 * of 0, and the creation forms are labelled "Prix unitaire (XOF)", so this is
 * what the value the user typed means.
 *
 * Dividing by 100 unconditionally is therefore wrong, and it was being done on
 * three client-facing surfaces: the PDF attached to every email, the client
 * portal, and the amount handed to GeniusPay. A 25 000 XOF invoice was printed
 * as "250,00 XOF" and would have been charged 250 XOF.
 *
 * ## The exception, which is not one
 *
 * `PLANS.priceMonthlyCents` and `subscription_cycles.amount_cents` (SaaS
 * subscriptions, MVP6) are stored in **hundredths of XOF**: 15 000 XOF/month is
 * `1_500_000`. That side is internally consistent — it divides by 100 before
 * charging — so it is left alone rather than migrated, but it means those two
 * columns must never be passed straight to `formatMoney`. Use
 * {@link formatSaasPrice}.
 */

/**
 * Currencies with no minor unit (ISO 4217 exponent 0).
 *
 * Restricted to the ones plausibly reachable from here — the West-African CFA
 * zone this product targets, plus the usual zero-decimal suspects.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'XOF',
  'XAF',
  'GNF',
  'KMF',
  'DJF',
  'RWF',
  'BIF',
  'MGA',
  'CLP',
  'ISK',
  'JPY',
  'KRW',
  'PYG',
  'UGX',
  'VND',
  'VUV',
]);

/** How many decimals the currency's minor unit implies: 0 for XOF, 2 otherwise. */
export function currencyDecimals(currency: string): 0 | 2 {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

function toNumber(amount: number | string | bigint | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const value = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Formats a stored minor-unit amount for display.
 *
 * Implemented by hand rather than with `Intl.NumberFormat` for two reasons: the
 * PDF templates need byte-for-byte determinism across Node builds (ICU data
 * differs), and a browser-side `toLocaleString()` with an implicit locale
 * disagrees with the server render and makes React report a hydration mismatch.
 *
 * The thousands separator is a plain U+0020: the narrow no-break space (U+202F)
 * is absent from the standard PDF Helvetica font and renders as a stray glyph.
 *
 * @param amount - Amount in the currency's minor unit, as stored.
 * @param currency - ISO code, appended after the number.
 * @example formatMoney(25000, 'XOF') // "25 000 XOF"
 * @example formatMoney(25000, 'EUR') // "250,00 EUR"
 */
export function formatMoney(
  amount: number | string | bigint | null | undefined,
  currency = 'XOF'
): string {
  const value = toNumber(amount);
  const negative = value < 0;
  const abs = Math.abs(Math.round(value));
  const sign = negative ? '-' : '';

  if (currencyDecimals(currency) === 0) {
    const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${sign}${grouped} ${currency}`;
  }

  const units = Math.floor(abs / 100);
  const decimals = abs % 100;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped},${String(decimals).padStart(2, '0')} ${currency}`;
}

/**
 * Formats a SaaS subscription price, which is stored in hundredths of XOF.
 *
 * @param hundredths - `PLANS.priceMonthlyCents` or `subscription_cycles.amount_cents`.
 */
export function formatSaasPrice(
  hundredths: number | string | bigint | null | undefined,
  currency = 'XOF'
): string {
  return formatMoney(Math.round(toNumber(hundredths) / 100), currency);
}

/**
 * Converts a stored amount into the number GeniusPay expects.
 *
 * The gateway takes the amount in the currency's normal unit — its own examples
 * post `{"amount": 5000}` for 5 000 XOF — so a zero-decimal currency is passed
 * through untouched and everything else is divided by its minor unit.
 *
 * @param amount - Amount in the currency's minor unit, as stored.
 */
export function toGatewayAmount(
  amount: number | string | bigint | null | undefined,
  currency = 'XOF'
): number {
  const value = toNumber(amount);
  return currencyDecimals(currency) === 0 ? Math.round(value) : value / 100;
}

/**
 * Converts an amount reported by GeniusPay back into stored minor units.
 *
 * The inverse of {@link toGatewayAmount}. Used on the webhook path, where the
 * fees and the net amount come back from the gateway and have to be persisted in
 * the same unit as the rest of the invoice.
 */
export function fromGatewayAmount(
  amount: number | string | null | undefined,
  currency = 'XOF'
): bigint {
  const value = toNumber(amount);
  return BigInt(Math.round(currencyDecimals(currency) === 0 ? value : value * 100));
}

/**
 * A money column on its way into a JSON response.
 *
 * Every `*_cents` column is a `bigint`, and `JSON.stringify` — hence
 * `NextResponse.json` — throws outright on one: *Do not know how to serialize a
 * BigInt*, which surfaces as a 500 rather than as a missing field. Minor units
 * therefore cross the wire as decimal strings, everywhere, without exception.
 *
 * The parameter is `unknown` because the repositories hand back loosely typed
 * rows; `null` maps to `"0"` so a caller never has to special-case a generated
 * column that the database always computes.
 */
export function bigintToString(value: unknown): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}
