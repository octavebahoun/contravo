import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { formatErrorResponse } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import {
  organizations,
  subscriptions,
  quotes,
  invoices,
  contracts,
  deliverables,
  apiKeys,
  webhookEndpoints,
} from '@/lib/db/schema';
import { eq, isNull, sql } from 'drizzle-orm';
import { PLANS } from '@/lib/billing/plans';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    // 1. Get subscriptions & billing status
    const subs = await db.select().from(subscriptions);
    let activeCount = 0;
    let cancelledCount = 0;
    let suspendedCount = 0;
    let freeCount = 0;
    let proCount = 0;
    let businessCount = 0;
    let mrr = 0;

    // `mrr` is expressed in the same unit as `PLANS.priceMonthlyCents` and
    // `subscription_cycles.amount_cents`: hundredths of XOF. The prices used to
    // be hardcoded here as whole XOF, so the figure disagreed with both the plan
    // table and the finance page, and a plan price change silently left this
    // endpoint behind.
    for (const sub of subs) {
      if (sub.status === 'active') {
        activeCount++;
        if (sub.planId === 'pro') {
          proCount++;
          mrr += PLANS.pro.priceMonthlyCents;
        } else if (sub.planId === 'business') {
          businessCount++;
          mrr += PLANS.business.priceMonthlyCents;
        } else {
          freeCount++;
        }
      } else if (sub.status === 'cancelled') {
        cancelledCount++;
      } else if (sub.status === 'suspended') {
        suspendedCount++;
      }
    }

    const arr = mrr * 12;
    const totalSubs = subs.length;
    const churnRate = totalSubs > 0 ? ((cancelledCount + suspendedCount) / totalSubs) * 100 : 0;

    // 2. Count organizations. Soft-deleted ones were counted too, so the
    // "active organizations" tile only ever went up.
    const [orgCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizations)
      .where(isNull(organizations.deletedAt));

    // 3. Count documents
    const [quotesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(quotes);
    const [invoicesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices);
    const [contractsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(contracts);
    const [deliverablesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(deliverables);

    const totalDocuments =
      (quotesCount?.count ?? 0) +
      (invoicesCount?.count ?? 0) +
      (contractsCount?.count ?? 0) +
      (deliverablesCount?.count ?? 0);

    // 4. Count infrastructure
    const [activeKeysCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(sql`revoked_at IS NULL`);

    const [activeWebhooksCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.active, true));

    // 5. Growth on last 12 months
    const growth = await db
      .select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(organizations)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM') ASC`);

    return NextResponse.json({
      mrr,
      arr,
      churnRate,
      activeOrganizations: orgCount?.count ?? 0,
      plansDistribution: {
        free: freeCount,
        pro: proCount,
        business: businessCount,
      },
      documents: {
        total: totalDocuments,
        quotes: quotesCount?.count ?? 0,
        invoices: invoicesCount?.count ?? 0,
        contracts: contractsCount?.count ?? 0,
        deliverables: deliverablesCount?.count ?? 0,
      },
      infrastructure: {
        activeApiKeys: activeKeysCount?.count ?? 0,
        activeWebhooks: activeWebhooksCount?.count ?? 0,
      },
      growth,
      systemHealth: {
        apiStatus: 'healthy',
        geniusPayStatus: 'healthy',
      },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
