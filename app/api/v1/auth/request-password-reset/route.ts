import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { requestPasswordResetSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';
import { emit } from '@/lib/webhooks';

/** A reset link is only usable for one hour. */
const TOKEN_TTL_MINUTES = 60;

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const body = await request.json();
    const validated = requestPasswordResetSchema.parse(body);

    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, validated.email.toLowerCase().trim()))
      .limit(1);

    // Security: Do not reveal if email exists or not, always return success
    if (result.length > 0) {
      const user = result[0];
      const ipAddress = request.headers.get('x-forwarded-for') || undefined;

      // Any link sent earlier stops working: a new request supersedes the old
      // one, so a stolen mailbox cannot be replayed from an older message.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        );

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: ipAddress,
      });

      await createAuditLog({
        actorUserId: user.id,
        action: 'auth.password-reset-requested',
        ipAddress,
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // n8n turns this into the actual email. The raw token leaves the system
      // exactly once, here, and is never stored in a readable form.
      await emit('user.password_reset_requested', null, {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        resetUrl: `${baseUrl}/reset-password?token=${token}`,
        expiresAt: expiresAt.toISOString(),
        expiresInMinutes: TOKEN_TTL_MINUTES,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[PASSWORD_RESET_TOKEN] ${token}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'If the email exists, a password reset link has been generated.',
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
