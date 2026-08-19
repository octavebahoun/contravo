'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { organizations, users, memberships } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { createAuditLog } from '@/lib/audit';
import {
  setupSchema,
  composeLegalMentions,
  composeBankDetails,
  type SetupInput,
} from './compose';

/**
 * Résultat d'une action de mise en route.
 *
 * La navigation est **rendue au client** plutôt que faite ici par `redirect()`.
 * Appelée depuis `startTransition`, une action qui redirige laissait l'écran sur
 * le récapitulatif : les réponses étaient bien enregistrées, mais rien ne
 * bougeait — indiscernable, pour qui regarde, d'un bouton mort.
 */
type OnboardingResult = { error: string } | { redirectTo: string };

export async function completeOnboarding(input: SetupInput): Promise<OnboardingResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Certaines réponses sont invalides.' };
  }
  const data = parsed.data;

  // `getSession()` resolves to the user row itself, not to a `{ user }` wrapper.
  const user = await getSession();
  if (!user) return { redirectTo: '/sign-in' };

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
    return { redirectTo: '/dashboard' };
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

  return { redirectTo: '/dashboard' };
}

/**
 * Leaves without answering.
 *
 * The flow is skippable on purpose — a setup form that cannot be escaped is a
 * wall in front of a product someone has not yet decided to use. The stamp is
 * still written, so the gate does not ask again; everything asked here remains
 * editable under Paramètres › Général.
 */
export async function skipOnboarding(): Promise<OnboardingResult> {
  const user = await getSession();
  if (!user) return { redirectTo: '/sign-in' };

  const [membership] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (membership) await markDone(membership.organizationId);
  return { redirectTo: '/dashboard' };
}

async function markDone(organizationId: string) {
  await db
    .update(organizations)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}
