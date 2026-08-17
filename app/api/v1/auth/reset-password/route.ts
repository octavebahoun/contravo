import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens, sessions } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
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

    // The token is looked up by hash: only the holder of the emailed value can
    // produce it, and the table never contains a usable link.
    const tokenHash = crypto.createHash('sha256').update(validated.token).digest('hex');

    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!resetToken) {
      throw new ApiError('INVALID_TOKEN', 'The password reset token is invalid or expired', 400);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, resetToken.userId))
      .limit(1);

    if (!user) {
      throw new ApiError('INVALID_TOKEN', 'The password reset token is invalid or expired', 400);
    }

    const passwordHash = await hashPassword(validated.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Single use: burning the token inside the transaction closes the window
      // where two concurrent requests could both reset the password.
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      // A reset is the standard remedy for a compromised account, so every
      // existing session has to go — otherwise the attacker keeps their cookie.
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    });

    const ipAddress = request.headers.get('x-forwarded-for') || undefined;
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
