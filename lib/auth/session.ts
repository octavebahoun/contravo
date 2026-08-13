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

export async function getSessionUser(token: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db
    .select({
      session: sessions,
      user: users,
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
