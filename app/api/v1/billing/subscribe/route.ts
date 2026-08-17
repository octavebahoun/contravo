import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getApiContext } from '@/lib/auth/unified-auth';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createSubscriptionCheckout } from '@/lib/billing/saas-billing.service';
import { PLANS, PlanId } from '@/lib/billing/plans';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'Vous devez être connecté', 401);
    }

    const body = await request.json().catch(() => ({}));
    // `planId` is the historical field name; the dashboard sends `targetPlanId`.
    const planId = (body.targetPlanId || body.planId) as PlanId | undefined;

    if (!planId || !PLANS[planId]) {
      throw new ApiError('BAD_REQUEST', 'Champ targetPlanId requis (pro ou business)', 400);
    }

    // The organization comes from the request context, not the body: otherwise
    // any member could start a checkout on behalf of another organization.
    const ctx = await getApiContext();
    const result = await createSubscriptionCheckout(ctx.organizationId, user.id, planId);

    return NextResponse.json(result);
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
