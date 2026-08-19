import argon2 from 'argon2';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { sessions, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function comparePasswords(
  plainTextPassword: string,
  passwordHash: string
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainTextPassword);
  } catch (error) {
    return false;
  }
}

export async function createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  // Expiration: 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });

  return token;
}

/**
 * The signed-in user, as everything downstream is allowed to see them.
 *
 * Deliberately **not** the whole `users` row: `password_hash` used to travel with
 * it, and `GET /api/user` serialises this object straight to the browser — so
 * every dashboard page was handed the account's argon2 hash. Anything needing the
 * hash asks for it explicitly through {@link getUserPasswordHash}, which is a
 * server-only path.
 */
export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Reads one account's password hash, by id.
 *
 * Separate from the session on purpose: changing a password and deleting an
 * account are the only two things that need it, both server actions, and both
 * already load the account. Keeping it out of the session is what makes leaking
 * it impossible rather than merely unlikely.
 */
export async function getUserPasswordHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.passwordHash ?? null;
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        emailVerifiedAt: users.emailVerifiedAt,
        isSuperAdmin: users.isSuperAdmin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt)
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { session, user } = result[0];

  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    return null;
  }

  // Session sliding: if less than 7 days remaining, extend to 30 days
  const remainingTime = new Date(session.expiresAt).getTime() - Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (remainingTime < sevenDays) {
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, session.id));
  }

  return user;
}

export async function setSessionCookie(token: string) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  (await cookies()).set('session', token, {
    expires: expiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function deleteSession(token: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, tokenHash));
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;
  return getSessionUser(token);
}
