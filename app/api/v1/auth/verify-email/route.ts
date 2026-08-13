import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyEmailSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const body = await request.json();
    const validated = verifyEmailSchema.parse(body);

    // Expected format: verify-email-UUID
    const prefix = 'verify-email-';
    if (!validated.token.startsWith(prefix)) {
      throw new ApiError('INVALID_TOKEN', 'The email verification token is invalid or expired', 400);
    }

    const userId = validated.token.substring(prefix.length);
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError('INVALID_TOKEN', 'The email verification token is invalid or expired', 400);
    }

    const user = result[0];
    if (user.emailVerifiedAt) {
      return NextResponse.json({ success: true, message: 'Email already verified' });
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));

    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    await createAuditLog({
      actorUserId: userId,
      action: 'auth.verify-email',
      ipAddress,
    });

    return NextResponse.json({ success: true, message: 'Email successfully verified' });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
