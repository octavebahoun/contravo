import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { invitations, memberships, organizations, users } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { assertQuota } from '@/lib/billing/quotas.service';
import { emit } from '@/lib/webhooks';
import { getAppUrl } from '@/lib/config/app-url';

/** An invitation link stays valid for a week. */
const INVITATION_TTL_DAYS = 7;

export type CreateInvitationInput = {
  organizationId: string;
  email: string;
  role: string;
  invitedByUserId: string;
};

/**
 * Creates an invitation and emits the event that makes n8n send the email.
 *
 * Both entry points (the `/api/v1` route and the dashboard server action) go
 * through here: they used to duplicate the token logic, and only one of them
 * enforced the member quota.
 */
export async function createOrganizationInvitation(input: CreateInvitationInput) {
  const email = input.email.toLowerCase().trim();

  const [existingMember] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(users.email, email), eq(memberships.organizationId, input.organizationId)))
    .limit(1);

  if (existingMember) {
    throw new ApiError('ALREADY_MEMBER', 'Cette personne fait déjà partie de l’organisation', 409);
  }

  const [pending] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email),
        eq(invitations.organizationId, input.organizationId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);

  if (pending) {
    throw new ApiError('INVITATION_PENDING', 'Une invitation est déjà en attente pour cette adresse', 409);
  }

  // Fail here rather than letting the invitee hit the wall on acceptance.
  // The seat is only really consumed by /api/v1/invitations/accept.
  await assertQuota(input.organizationId, 'maxMembers');

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash,
      expiresAt,
      invitedBy: input.invitedByUserId,
    })
    .returning();

  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  const [inviter] = await db
    .select({ fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, input.invitedByUserId))
    .limit(1);

  const baseUrl = getAppUrl();

  // The raw token leaves the system exactly once, here. Only its hash is stored.
  await emit('invitation.sent', input.organizationId, {
    invitationId: invitation.id,
    email,
    role: input.role,
    organizationName: organization?.name || '',
    invitedByName: inviter?.fullName || '',
    invitedByEmail: inviter?.email || '',
    inviteUrl: `${baseUrl}/invite/${token}`,
    expiresAt: expiresAt.toISOString(),
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[INVITATION_TOKEN] ${token}`);
  }

  return { invitation, token };
}

export function hashInvitationToken(rawToken: string): string {
  // Older links carried an `invite-` prefix; keep accepting them.
  const token = rawToken.startsWith('invite-') ? rawToken.substring('invite-'.length) : rawToken;
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type InvitationPreview = {
  id: string;
  email: string;
  role: string;
  organizationName: string;
  invitedByName: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'expired';
};

/**
 * Read-only lookup used by the public `/invite/[token]` screen, so a visitor can
 * see who invited them before signing in.
 */
export async function getInvitationByToken(rawToken: string): Promise<InvitationPreview | null> {
  const tokenHash = hashInvitationToken(rawToken);

  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      organizationName: organizations.name,
      invitedByName: users.fullName,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .innerJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  const status: InvitationPreview['status'] = row.acceptedAt
    ? 'accepted'
    : row.expiresAt < new Date()
    ? 'expired'
    : 'pending';

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    organizationName: row.organizationName,
    invitedByName: row.invitedByName,
    expiresAt: row.expiresAt,
    status,
  };
}
