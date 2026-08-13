import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signupSchema } from '@/lib/validation';
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth/session';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const body = await request.json();
    const validated = await signupSchema.parseAsync(body);

    // Check if user exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, validated.email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError('ALREADY_EXISTS', 'A user with this email address already exists', 409);
    }

    // Hash password & create user
    const passwordHash = await hashPassword(validated.password);
    const [user] = await db
      .insert(users)
      .values({
        email: validated.email.toLowerCase().trim(),
        passwordHash,
        fullName: validated.fullName,
      })
      .returning();

    // Create session
    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    const token = await createSession(user.id, ipAddress, userAgent);
    await setSessionCookie(token);

    // Audit Log
    await createAuditLog({
      actorUserId: user.id,
      action: 'auth.signup',
      ipAddress,
      metadata: { email: user.email },
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
