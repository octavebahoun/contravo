'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { organizations, users, memberships } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { createAuditLog } from '@/lib/audit';

/**
 * Saves the first-run setup.
 *
 * Everything collected here ends up on a document the client will read: the
 * organization name heads the PDF, `legalMentions` is its footer, `bankDetails`
 * is how the client actually pays. Sign-up cannot ask for any of it without
 * turning a two-field form into a tax declaration, so it is asked once, here,
 * before the first document exists.
 */
const setupSchema = z.object({
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

export async function completeOnboarding(input: SetupInput) {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Certaines réponses sont invalides.' };
  }
  const data = parsed.data;

  // `getSession()` resolves to the user row itself, not to a `{ user }` wrapper.
  const user = await getSession();
  if (!user) redirect('/sign-in');

  const [membership] = await db
    .select({ organizationId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!membership) {
    return { error: "Aucune organisation rattachée à ce compte." };
  }

  // Only an owner configures the organization. An invited member reaching this
  // page would otherwise rewrite the legal footer of a company that is not
  // theirs to describe.
  if (membership.role !== 'owner') {
    await markDone(membership.organizationId);
    redirect('/dashboard');
  }

  await db
    .update(users)
    .set({ fullName: data.fullName, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await db
    .update(organizations)
    .set({
      name: data.organizationName,
      defaultCurrency: data.currency.toUpperCase(),
      legalMentions: composeLegalMentions(data),
      bankDetails: composeBankDetails(data),
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, membership.organizationId));

  await createAuditLog({
    organizationId: membership.organizationId,
    actorUserId: user.id,
    action: 'org.onboarded',
  });

  redirect('/dashboard');
}

/**
 * Leaves without answering.
 *
 * The flow is skippable on purpose — a setup form that cannot be escaped is a
 * wall in front of a product someone has not yet decided to use. The stamp is
 * still written, so the gate does not ask again; everything asked here remains
 * editable under Paramètres › Général.
 */
export async function skipOnboarding() {
  const user = await getSession();
  if (!user) redirect('/sign-in');

  const [membership] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (membership) await markDone(membership.organizationId);
  redirect('/dashboard');
}

async function markDone(organizationId: string) {
  await db
    .update(organizations)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}
