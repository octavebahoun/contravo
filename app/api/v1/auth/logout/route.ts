import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth/session';
import { formatErrorResponse } from '@/lib/errors';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (token) {
      await deleteSession(token);
      cookieStore.delete('session');
    }

    if (user) {
      const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
      await createAuditLog({
        actorUserId: user.id,
        action: 'auth.logout',
        ipAddress,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
