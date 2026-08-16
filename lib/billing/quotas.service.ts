import { db } from '@/lib/db/drizzle';
import {
  subscriptions,
  quotaUsage,
  quotaPeriodUsage,
  memberships,
  clients,
  projects,
  apiKeys,
  webhookEndpoints,
  files,
  Subscription,
  QuotaUsage,
  organizations,
} from '@/lib/db/schema';
import { PLANS, PlanId, QuotaKey } from './plans';
import { eq, and, sql } from 'drizzle-orm';

export class QuotaExceededError extends Error {
  public readonly status = 403;
  public readonly code = 'QUOTA_EXCEEDED';
  public readonly quotaKey: QuotaKey;
  public readonly current: number;
  public readonly limit: number;
  public readonly planId: PlanId;

  constructor(params: {
    quotaKey: QuotaKey;
    current: number;
    limit: number;
    planId: PlanId;
  }) {
    super(
      `Quota '${params.quotaKey}' exceeded for plan '${params.planId}' (${params.current}/${params.limit})`
    );
    this.name = 'QuotaExceededError';
    this.quotaKey = params.quotaKey;
    this.current = params.current;
    this.limit = params.limit;
    this.planId = params.planId;
  }
}

export async function getSubscription(
  organizationId: string
): Promise<Subscription> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (sub) {
    return sub;
  }

  // Auto-initialize free plan if missing
  const farFuture = new Date('2099-12-31T23:59:59Z');
  const [newSub] = await db
    .insert(subscriptions)
    .values({
      organizationId,
      planId: 'free',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: farFuture,
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: { updatedAt: new Date() },
    })
    .returning();

  return newSub;
}

export async function getQuotaUsage(
  organizationId: string
): Promise<QuotaUsage> {
  const [usage] = await db
    .select()
    .from(quotaUsage)
    .where(eq(quotaUsage.organizationId, organizationId))
    .limit(1);

  if (usage) {
    return usage;
  }

  return await recomputeQuotaUsage(organizationId);
}

export async function recomputeQuotaUsage(
  organizationId: string
): Promise<QuotaUsage> {
  const [memCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.organizationId, organizationId));

  const [cliCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        sql`deleted_at IS NULL`
      )
    );

  const [prjCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        sql`deleted_at IS NULL`
      )
    );

  const [keyCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, organizationId),
        sql`revoked_at IS NULL`
      )
    );

  const [whCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.organizationId, organizationId),
        eq(webhookEndpoints.active, true)
      )
    );

  const [storage] = await db
    .select({ totalBytes: sql<bigint>`coalesce(sum(size_bytes), 0)` })
    .from(files)
    .where(eq(files.organizationId, organizationId));

  const [upserted] = await db
    .insert(quotaUsage)
    .values({
      organizationId,
      membersCount: memCount?.count ?? 0,
      clientsCount: cliCount?.count ?? 0,
      projectsCount: prjCount?.count ?? 0,
      apiKeysCount: keyCount?.count ?? 0,
      webhookEndpointsCount: whCount?.count ?? 0,
      storageBytes: storage?.totalBytes ?? sql`0`,
      lastRecomputedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: quotaUsage.organizationId,
      set: {
        membersCount: memCount?.count ?? 0,
        clientsCount: cliCount?.count ?? 0,
        projectsCount: prjCount?.count ?? 0,
        apiKeysCount: keyCount?.count ?? 0,
        webhookEndpointsCount: whCount?.count ?? 0,
        storageBytes: storage?.totalBytes ?? sql`0`,
        lastRecomputedAt: new Date(),
      },
    })
    .returning();

  return upserted;
}

export function getCurrentPeriodStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export async function assertQuota(
  organizationId: string,
  quotaKey: QuotaKey,
  incrementAmount: number = 1
): Promise<void> {
  const sub = await getSubscription(organizationId);
  const planId = (sub.planId as PlanId) || 'free';
  const plan = PLANS[planId] || PLANS.free;

  let limit: number | boolean | string | null = plan.quotas[quotaKey];

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (org) {
    if (quotaKey === 'maxMembers' && org.customMaxMembers !== null) limit = org.customMaxMembers;
    else if (quotaKey === 'maxClients' && org.customMaxClients !== null) limit = org.customMaxClients;
    else if (quotaKey === 'maxProjects' && org.customMaxProjects !== null) limit = org.customMaxProjects;
    else if (quotaKey === 'maxStorageBytes' && org.customMaxStorageBytes !== null) limit = Number(org.customMaxStorageBytes);
    else if (quotaKey === 'maxApiKeys' && org.customMaxApiKeys !== null) limit = org.customMaxApiKeys;
    else if (quotaKey === 'maxWebhookEndpoints' && org.customMaxWebhookEndpoints !== null) limit = org.customMaxWebhookEndpoints;
  }

  if (limit === null || limit === undefined) {
    return; // Unlimited
  }

  if (typeof limit === 'boolean') {
    if (!limit) {
      throw new QuotaExceededError({
        quotaKey,
        current: 1,
        limit: 0,
        planId,
      });
    }
    return;
  }

  let current = 0;

  if (
    quotaKey === 'maxMembers' ||
    quotaKey === 'maxClients' ||
    quotaKey === 'maxProjects' ||
    quotaKey === 'maxApiKeys' ||
    quotaKey === 'maxWebhookEndpoints' ||
    quotaKey === 'maxStorageBytes'
  ) {
    const usage = await getQuotaUsage(organizationId);
    switch (quotaKey) {
      case 'maxMembers':
        current = usage.membersCount;
        break;
      case 'maxClients':
        current = usage.clientsCount;
        break;
      case 'maxProjects':
        current = usage.projectsCount;
        break;
      case 'maxApiKeys':
        current = usage.apiKeysCount;
        break;
      case 'maxWebhookEndpoints':
        current = usage.webhookEndpointsCount;
        break;
      case 'maxStorageBytes':
        current = Number(usage.storageBytes);
        break;
    }
  } else if (quotaKey === 'maxApiCallsPerMonth' || quotaKey === 'maxPublicTokensPerMonth') {
    const periodStart = getCurrentPeriodStart();
    const [pUsage] = await db
      .select()
      .from(quotaPeriodUsage)
      .where(
        and(
          eq(quotaPeriodUsage.organizationId, organizationId),
          eq(quotaPeriodUsage.periodStart, periodStart)
        )
      )
      .limit(1);

    if (quotaKey === 'maxApiCallsPerMonth') {
      current = pUsage ? Number(pUsage.apiCallsCount) : 0;
    } else {
      current = pUsage ? pUsage.publicTokensCreated : 0;
    }
  }

  if (current + incrementAmount > (limit as number)) {
    throw new QuotaExceededError({
      quotaKey,
      current,
      limit: limit as number,
      planId,
    });
  }
}

export async function incrementPeriodUsage(
  organizationId: string,
  key: 'apiCalls' | 'publicTokens',
  amount: number = 1
): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  if (key === 'apiCalls') {
    await db
      .insert(quotaPeriodUsage)
      .values({
        organizationId,
        periodStart,
        apiCallsCount: sql`${amount}::bigint`,
        publicTokensCreated: 0,
      })
      .onConflictDoUpdate({
        target: [quotaPeriodUsage.organizationId, quotaPeriodUsage.periodStart],
        set: {
          apiCallsCount: sql`${quotaPeriodUsage.apiCallsCount} + ${amount}`,
        },
      });
  } else {
    await db
      .insert(quotaPeriodUsage)
      .values({
        organizationId,
        periodStart,
        apiCallsCount: sql`0`,
        publicTokensCreated: amount,
      })
      .onConflictDoUpdate({
        target: [quotaPeriodUsage.organizationId, quotaPeriodUsage.periodStart],
        set: {
          publicTokensCreated: sql`${quotaPeriodUsage.publicTokensCreated} + ${amount}`,
        },
      });
  }
}
