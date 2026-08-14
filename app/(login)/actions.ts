'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
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
      error: 'Invalid email or password. Please try again.',
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
      error: 'Invalid email or password. Please try again.',
      email,
      password
    };
  }

  const token = await createSession(foundUser.id);
  await setSessionCookie(token);

  await logActivity(foundOrg?.id, foundUser.id, 'auth.login');

  redirect('/dashboard');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional()
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'Failed to create user. Please try again.',
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
      error: 'Failed to create user. Please try again.',
      email,
      password
    };
  }

  let orgId: string;
  let userRole: string;
  let createdOrg: typeof organizations.$inferSelect | null = null;

  if (inviteId) {
    // Check if there's a valid invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, inviteId),
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
      return { error: 'Invalid or expired invitation.', email, password };
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
        error: 'Failed to create organization. Please try again.',
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

  redirect('/dashboard');
});

export async function signOut() {
  const user = (await getUser()) as User;
  if (user) {
    const userWithOrg = await getUserWithOrganization(user.id);
    await logActivity(userWithOrg?.organizationId, user.id, 'auth.logout');
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (token) {
      await deleteSession(token);
    }
    cookieStore.delete('session');
  }
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
        error: 'Current password is incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.'
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
        error: 'Incorrect password. Account deletion failed.'
      };
    }

    const userWithOrg = await getUserWithOrganization(user.id);

    await logActivity(
      userWithOrg?.organizationId,
      user.id,
      'auth.delete_account'
    );

    await db.delete(users).where(eq(users.id, user.id));

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
      return { error: 'User is not part of an organization' };
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
      return { error: 'User is not part of an organization' };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(memberships, eq(users.id, memberships.userId))
      .where(
        and(eq(users.email, email), eq(memberships.organizationId, userWithOrg.organizationId))
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { error: 'User is already a member of this organization' };
    }

    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.organizationId, userWithOrg.organizationId),
          isNull(invitations.acceptedAt)
        )
      )
      .limit(1);

    if (existingInvitation.length > 0 && new Date(existingInvitation[0].expiresAt) > new Date()) {
      return { error: 'An active invitation has already been sent to this email' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(invitations).values({
      organizationId: userWithOrg.organizationId,
      email,
      role,
      tokenHash,
      expiresAt,
      invitedBy: user.id
    });

    await logActivity(
      userWithOrg.organizationId,
      user.id,
      'invitation.create'
    );

    return { success: 'Invitation sent successfully' };
  }
);
