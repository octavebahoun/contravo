import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getApiContext } from '@/lib/auth/unified-auth';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { resumeSubscription } from '@/lib/billing/saas-billing.service';

/** Undo a scheduled downgrade while the paid period is still running. */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'Vous devez être connecté', 401);
    }

    const ctx = await getApiContext();
    const result = await resumeSubscription(ctx.organizationId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
