import { z } from 'zod';

/**
 * Shape and composition of the first-run setup.
 *
 * Kept out of `actions.ts`: that file carries `'use server'`, where every export
 * must be an async function. Two pure helpers exported beside the actions made
 * `next build` fail — a break that neither `tsc` nor the tests can see, since
 * the rule belongs to the Next compiler alone.
 *
 * Everything collected here ends up on a document the client will read: the
 * organization name heads the PDF, `legalMentions` is its footer, `bankDetails`
 * is how the client actually pays. Sign-up cannot ask for any of it without
 * turning a two-field form into a tax declaration, so it is asked once, here,
 * before the first document exists.
 */
export const setupSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(1).max(160),
  activity: z.string().trim().max(60).optional(),
  currency: z.string().trim().length(3),
  legalForm: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  registration: z.string().trim().max(120).optional(),
  taxId: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  contactEmail: z.string().trim().max(160).optional(),
  bankName: z.string().trim().max(120).optional(),
  accountHolder: z.string().trim().max(160).optional(),
  iban: z.string().trim().max(80).optional(),
  mobileMoney: z.string().trim().max(120).optional(),
});

export type SetupInput = z.infer<typeof setupSchema>;

/**
 * Builds the single-line legal footer printed on every document.
 *
 * `organizations` has no columns for address, registration number or phone —
 * MVP4 §6.2 deliberately keeps them inside `legal_mentions`, rendered as one
 * block. Composing here rather than storing fields separately keeps that
 * decision in one place, and empty answers simply drop out.
 */
export function composeLegalMentions(input: SetupInput): string | null {
  const parts = [
    input.legalForm ? `${input.organizationName} ${input.legalForm}` : input.organizationName,
    input.address,
    input.registration ? `RCCM ${input.registration}` : null,
    input.taxId ? `NCC ${input.taxId}` : null,
    input.contactEmail,
    input.phone,
  ].filter((p): p is string => Boolean(p && p.trim()));

  return parts.length > 1 ? parts.join(' — ') : null;
}

/** Free-form key/value block, rendered as-is at the bottom of an invoice. */
export function composeBankDetails(input: SetupInput): Record<string, string> | null {
  const details: Record<string, string> = {};
  if (input.bankName) details['Banque'] = input.bankName;
  if (input.accountHolder) details['Titulaire'] = input.accountHolder;
  if (input.iban) details['IBAN'] = input.iban;
  if (input.mobileMoney) details['Mobile Money'] = input.mobileMoney;
  return Object.keys(details).length > 0 ? details : null;
}
