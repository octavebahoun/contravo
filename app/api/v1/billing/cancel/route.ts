import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getApiContext } from '@/lib/auth/unified-auth';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { cancelSubscription } from '@/lib/billing/saas-billing.service';

/**
 * Schedule the downgrade to the Free plan at the end of the paid period.
 * The organization is read from the request context, never from the body, so a
 * member cannot cancel someone else's subscription.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'Vous devez être connecté', 401);
    }

    const ctx = await getApiContext();
    const result = await cancelSubscription(ctx.organizationId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
