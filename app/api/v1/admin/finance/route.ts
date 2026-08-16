import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { formatErrorResponse } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import { subscriptionCycles, organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const cyclesList = await db
      .select({
        id: subscriptionCycles.id,
        invoiceNumber: subscriptionCycles.invoiceNumber,
        organizationName: organizations.name,
        planId: subscriptionCycles.planId,
        amountCents: subscriptionCycles.amountCents,
        currency: subscriptionCycles.currency,
        status: subscriptionCycles.status,
        paidAt: subscriptionCycles.paidAt,
        failedReason: subscriptionCycles.failedReason,
        createdAt: subscriptionCycles.createdAt,
      })
      .from(subscriptionCycles)
      .innerJoin(organizations, eq(subscriptionCycles.organizationId, organizations.id))
      .orderBy(subscriptionCycles.createdAt);

    // Compute basic finance aggregates
    let totalRevenueCents = 0n;
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    const formattedCycles = cyclesList.map((cycle) => {
      if (cycle.status === 'paid') {
        totalRevenueCents += cycle.amountCents;
        paidCount++;
      } else if (cycle.status === 'failed') {
        failedCount++;
      } else if (cycle.status === 'pending') {
        pendingCount++;
      }

      return {
        ...cycle,
        amountCents: cycle.amountCents.toString(),
      };
    });

    return NextResponse.json({
      transactions: formattedCycles,
      aggregates: {
        totalRevenueXof: (Number(totalRevenueCents) / 100).toString(),
        paidCount,
        pendingCount,
        failedCount,
      },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
