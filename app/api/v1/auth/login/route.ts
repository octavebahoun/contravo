import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { loginSchema } from '@/lib/validation';
import { comparePasswords, createSession, setSessionCookie } from '@/lib/auth/session';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, validated.email.toLowerCase().trim()))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const user = result[0];
    const isPasswordCorrect = await comparePasswords(validated.password, user.passwordHash);
    if (!isPasswordCorrect) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    const token = await createSession(user.id, ipAddress, userAgent);
    await setSessionCookie(token);

    await createAuditLog({
      actorUserId: user.id,
      action: 'auth.login',
      ipAddress,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
