'use server';

import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  organizations,
  memberships,
  invitations,
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, createSession, setSessionCookie, deleteSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser, getUserWithOrganization } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { createAuditLog } from '@/lib/audit';
import { createOrganizationInvitation, hashInvitationToken } from '@/lib/invitations';
import crypto from 'crypto';

async function logActivity(
  organizationId: string | null | undefined,
  actorUserId: string,
  action: string,
  ipAddress?: string
) {
  await createAuditLog({
    organizationId: organizationId || null,
    actorUserId,
    action,
    ipAddress: ipAddress || null
  });
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

/**
 * Where to land after authenticating.
 *
 * The sign-in form has always carried a `redirect` field, and both actions used
 * to ignore it — an invitation link that bounced through sign-in lost its way
 * back. Only same-origin absolute paths are accepted: anything protocol
 * relative (`//evil.tld`) or absolute would turn this into an open redirect.
 */
function safeRedirect(formData: FormData): string {
  const target = formData.get('redirect');
  if (typeof target !== 'string') return '/dashboard';
  if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
  return target;
}

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const userWithOrg = await db
    .select({
      user: users,
      membership: memberships,
      org: organizations
    })
    .from(users)
    .leftJoin(memberships, eq(users.id, memberships.userId))
    .leftJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(users.email, email))
    .limit(1);

  if (userWithOrg.length === 0) {
    return {
      error: 'Adresse ou mot de passe incorrect.',
      email,
      password
    };
  }

  const { user: foundUser, org: foundOrg } = userWithOrg[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: 'Adresse ou mot de passe incorrect.',
      email,
      password
    };
  }

  const token = await createSession(foundUser.id);
  await setSessionCookie(token);

  await logActivity(foundOrg?.id, foundUser.id, 'auth.login');

  redirect(safeRedirect(formData));
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
  inviteToken: z.string().optional()
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId, inviteToken } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    // Dire lequel des deux cas s'est produit. « Réessayez » était un conseil
    // impossible à suivre : l'adresse restera prise au deuxième essai comme au
    // premier. La connexion, elle, garde son message unique et volontairement
    // vague — c'est là que l'énumération de comptes serait exploitable.
    return {
      error: 'Un compte existe déjà avec cette adresse. Connectez-vous.',
      email,
      password
    };
  }

  const passwordHash = await hashPassword(password);
  const fullName = email.split('@')[0];

  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      fullName
    })
    .returning();

  if (!createdUser) {
    return {
      error: 'La création du compte a échoué. Réessayez.',
      email,
      password
    };
  }

  let orgId: string;
  let userRole: string;
  let createdOrg: typeof organizations.$inferSelect | null = null;

  if (inviteToken || inviteId) {
    // An invited user must land inside the organization that invited them.
    // Without this branch sign-up spun up a brand new personal organization and
    // the invitation stayed pending forever.
    const [invitation] = inviteToken
      ? await db
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.tokenHash, hashInvitationToken(inviteToken)),
              eq(invitations.email, email)
            )
          )
          .limit(1)
      : await db
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.id, inviteId!),
              eq(invitations.email, email)
            )
          )
          .limit(1);

    if (invitation && !invitation.acceptedAt && new Date(invitation.expiresAt) > new Date()) {
      orgId = invitation.organizationId;
      userRole = invitation.role;

      await db
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      await logActivity(orgId, createdUser.id, 'invitation.accept');

      [createdOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
    } else {
      return { error: 'Invitation invalide ou expirée.', email, password };
    }
  } else {
    // Create a new organization if there's no invitation
    const slug = email.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() + '-' + Math.random().toString(36).substring(2, 6);
    const name = `${email.split('@')[0]}'s Organization`;

    [createdOrg] = await db
      .insert(organizations)
      .values({
        name,
        slug
      })
      .returning();

    if (!createdOrg) {
      return {
        error: 'La création de l’organisation a échoué. Réessayez.',
        email,
        password
      };
    }

    orgId = createdOrg.id;
    userRole = 'owner';

    await logActivity(orgId, createdUser.id, 'org.create');
  }

  await db.insert(memberships).values({
    userId: createdUser.id,
    organizationId: orgId,
    role: userRole
  });

  await logActivity(orgId, createdUser.id, 'auth.signup');

  const token = await createSession(createdUser.id);
  await setSessionCookie(token);

  redirect(safeRedirect(formData));
});

export async function signOut() {
  const cookieStore = await cookies();
  const user = (await getUser()) as User;
  if (user) {
    const userWithOrg = await getUserWithOrganization(user.id);
    await logActivity(userWithOrg?.organizationId, user.id, 'auth.logout');
    const token = cookieStore.get('session')?.value;
    if (token) {
      await deleteSession(token);
    }
    cookieStore.delete('session');
  }
  // Set client-side by the org switcher, so it outlives the session otherwise.
  cookieStore.delete('organization_id');
  redirect('/sign-in');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Mot de passe actuel incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Le nouveau mot de passe doit différer de l’actuel.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Le nouveau mot de passe et sa confirmation ne correspondent pas.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithOrg = await getUserWithOrganization(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithOrg?.organizationId, user.id, 'auth.password_reset')
    ]);

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Mot de passe incorrect. La suppression du compte a échoué.'
      };
    }

    const userWithOrg = await getUserWithOrganization(user.id);

    await logActivity(
      userWithOrg?.organizationId,
      user.id,
      'auth.delete_account'
    );

    await db.delete(users).where(eq(users.id, user.id));

    // Les appartenances tombent en cascade avec le compte — et laissaient
    // derrière elles une organisation sans aucun membre : ses clients, ses
    // devis et ses factures survivaient sans que personne ne puisse plus jamais
    // les atteindre, ni les effacer. Une organisation que plus aucun compte ne
    // rejoint est morte : elle part avec le dernier de ses membres.
    //
    // Seulement celles devenues vides : un propriétaire qui s'en va d'une
    // équipe ne doit pas emporter le travail des autres.
    await db.execute(sql`
      delete from organizations o
       where not exists (
         select 1 from memberships m where m.organization_id = o.id
       )`);

    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (token) {
      await deleteSession(token);
    }
    cookieStore.delete('session');
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithOrg = await getUserWithOrganization(user.id);

    await Promise.all([
      db.update(users).set({ fullName: name, email }).where(eq(users.id, user.id)),
      logActivity(userWithOrg?.organizationId, user.id, 'auth.update_account')
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.string()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithOrg = await getUserWithOrganization(user.id);

    if (!userWithOrg?.organizationId) {
      return { error: 'Ce compte n’appartient à aucune organisation.' };
    }

    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.id, memberId),
          eq(memberships.organizationId, userWithOrg.organizationId)
        )
      );

    await logActivity(
      userWithOrg.organizationId,
      user.id,
      'member.delete'
    );

    return { success: 'Team member removed successfully' };
  }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'owner', 'admin', 'viewer'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithOrg = await getUserWithOrganization(user.id);

    if (!userWithOrg?.organizationId) {
      return { error: 'Ce compte n’appartient à aucune organisation.' };
    }

    try {
      // Shared with POST /api/v1/organizations/[slug]/invitations: duplicate
      // checks, member quota, and the `invitation.sent` event that actually
      // gets the email out. This form used to insert the row and stop there.
      await createOrganizationInvitation({
        organizationId: userWithOrg.organizationId,
        email,
        role,
        invitedByUserId: user.id,
      });
    } catch (error: any) {
      return { error: error?.message || 'Impossible d’envoyer l’invitation' };
    }

    await logActivity(
      userWithOrg.organizationId,
      user.id,
      'invitation.create'
    );

    return { success: 'Invitation envoyée' };
  }
);
