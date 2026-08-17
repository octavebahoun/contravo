import { describe, it, expect } from 'vitest';
import {
  currencyDecimals,
  formatMoney,
  formatSaasPrice,
  fromGatewayAmount,
  toGatewayAmount,
} from '../lib/money';

/**
 * Pins the money convention, which had drifted apart on four surfaces at once:
 * the PDF attached to every invoice email, the client portal, the amount handed
 * to GeniusPay and the admin dashboard all divided XOF amounts by 100.
 *
 * These are pure functions, so this file needs no database.
 */
describe('Money convention', () => {
  it('treats XOF as having no minor unit', () => {
    expect(currencyDecimals('XOF')).toBe(0);
    expect(currencyDecimals('xof')).toBe(0);
    expect(currencyDecimals('XAF')).toBe(0);
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('USD')).toBe(2);
  });

  it('displays a stored XOF amount as-is', () => {
    // The value a user typed into a field labelled "Prix unitaire (XOF)".
    expect(formatMoney(25000, 'XOF')).toBe('25 000 XOF');
    expect(formatMoney(150000, 'XOF')).toBe('150 000 XOF');
    expect(formatMoney('25000', 'XOF')).toBe('25 000 XOF');
    expect(formatMoney(25000n, 'XOF')).toBe('25 000 XOF');
  });

  it('still divides a currency that has a minor unit', () => {
    expect(formatMoney(25000, 'EUR')).toBe('250,00 EUR');
    expect(formatMoney(-50050, 'EUR')).toBe('-500,50 EUR');
  });

  it('handles empty and malformed input as zero', () => {
    expect(formatMoney(null, 'XOF')).toBe('0 XOF');
    expect(formatMoney(undefined, 'XOF')).toBe('0 XOF');
    expect(formatMoney('', 'XOF')).toBe('0 XOF');
    expect(formatMoney('abc', 'XOF')).toBe('0 XOF');
  });

  it('groups thousands with a plain space, not U+202F', () => {
    // The narrow no-break space is absent from the PDF Helvetica font.
    expect(formatMoney(129000000, 'XOF')).toBe('129 000 000 XOF');
    expect(formatMoney(129000000, 'XOF')).not.toMatch(/ /);
  });

  it('reads SaaS plan prices in hundredths of XOF', () => {
    // `PLANS.priceMonthlyCents` uses a different unit from business documents.
    expect(formatSaasPrice(1_500_000)).toBe('15 000 XOF');
    expect(formatSaasPrice(5_000_000)).toBe('50 000 XOF');
    expect(formatSaasPrice(3 * 1_500_000)).toBe('45 000 XOF');
    expect(formatSaasPrice(0)).toBe('0 XOF');
  });

  it('sends GeniusPay the amount in the currency’s normal unit', () => {
    // The gateway's own example posts {"amount": 5000} for 5 000 XOF.
    expect(toGatewayAmount(25000, 'XOF')).toBe(25000);
    expect(toGatewayAmount(5000, 'XOF')).toBe(5000);
    expect(toGatewayAmount(25000, 'EUR')).toBe(250);
  });

  it('converts a gateway amount back into stored minor units', () => {
    expect(fromGatewayAmount(25000, 'XOF')).toBe(25000n);
    expect(fromGatewayAmount(250, 'EUR')).toBe(25000n);
    expect(fromGatewayAmount(1000, 'XOF')).toBe(1000n);
    expect(fromGatewayAmount(null, 'XOF')).toBe(0n);
  });

  it('round-trips through the gateway without losing value', () => {
    for (const [amount, currency] of [
      [25000, 'XOF'],
      [1, 'XOF'],
      [999999, 'XOF'],
      [25000, 'EUR'],
      [1, 'EUR'],
    ] as const) {
      expect(fromGatewayAmount(toGatewayAmount(amount, currency), currency)).toBe(BigInt(amount));
    }
  });
});
