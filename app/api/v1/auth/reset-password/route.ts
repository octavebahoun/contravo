import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resetPasswordSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/auth/session';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const body = await request.json();
    const validated = await resetPasswordSchema.parseAsync(body);

    const prefix = 'reset-password-';
    if (!validated.token.startsWith(prefix)) {
      throw new ApiError('INVALID_TOKEN', 'The password reset token is invalid or expired', 400);
    }

    const userId = validated.token.substring(prefix.length);
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError('INVALID_TOKEN', 'The password reset token is invalid or expired', 400);
    }

    const user = result[0];
    const passwordHash = await hashPassword(validated.newPassword);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    await createAuditLog({
      actorUserId: user.id,
      action: 'auth.password-reset-completed',
      ipAddress,
    });

    return NextResponse.json({ success: true, message: 'Password successfully reset' });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
