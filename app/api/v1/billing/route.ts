import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { getSubscription, getQuotaUsage } from '@/lib/billing/quotas.service';
import { PLANS, PlanId } from '@/lib/billing/plans';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    const sub = await getSubscription(ctx.organizationId);
    const usage = await getQuotaUsage(ctx.organizationId);
    const planId = (sub.planId as PlanId) || 'free';
    const planConfig = PLANS[planId] || PLANS.free;

    return NextResponse.json({
      planId,
      status: sub.status,
      quotas: planConfig.quotas,
      usage: {
        membersCount: usage.membersCount || 1,
        clientsCount: usage.clientsCount || 0,
        projectsCount: usage.projectsCount || 0,
        storageBytesUsed: Number(usage.storageBytes || 0),
        apiCallsCount: 0,
      },
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}
