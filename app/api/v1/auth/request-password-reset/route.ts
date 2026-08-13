import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requestPasswordResetSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';

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
      const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
      
      await createAuditLog({
        actorUserId: user.id,
        action: 'auth.password-reset-requested',
        ipAddress,
      });

      // In development or test, we can print the simulated token to console
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[PASSWORD_RESET_TOKEN] reset-password-${user.id}`);
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
