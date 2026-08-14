import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createSubscriptionCheckout } from '@/lib/billing/saas-billing.service';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'Vous devez être connecté', 401);
    }

    const body = await request.json();
    const { organizationId, planId } = body;

    if (!organizationId || !planId) {
      throw new ApiError('BAD_REQUEST', 'Champs organizationId et planId requis', 400);
    }

    const result = await createSubscriptionCheckout(organizationId, user.id, planId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
