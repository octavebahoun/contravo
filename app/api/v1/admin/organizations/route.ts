import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { formatErrorResponse } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import { organizations, subscriptions, memberships } from '@/lib/db/schema';
import { eq, and, ilike, or, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || undefined;
    const plan = searchParams.get('plan') || undefined;
    const status = searchParams.get('status') || undefined;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(organizations.name, `%${search}%`),
          ilike(organizations.slug, `%${search}%`)
        )
      );
    }
    if (plan) {
      conditions.push(eq(subscriptions.planId, plan));
    }
    if (status) {
      conditions.push(eq(subscriptions.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orgsList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: subscriptions.planId,
        subscriptionStatus: subscriptions.status,
        createdAt: organizations.createdAt,
        customMaxMembers: organizations.customMaxMembers,
        customMaxClients: organizations.customMaxClients,
        customMaxProjects: organizations.customMaxProjects,
        customMaxStorageBytes: organizations.customMaxStorageBytes,
        customMaxApiKeys: organizations.customMaxApiKeys,
        customMaxWebhookEndpoints: organizations.customMaxWebhookEndpoints,
        memberCount: sql<number>`(select count(*)::int from ${memberships} where ${memberships.organizationId} = ${organizations.id})`,
      })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .where(whereClause)
      .orderBy(organizations.createdAt);

    // Format fields & defaults
    const formattedOrgs = orgsList.map((org) => ({
      ...org,
      plan: org.plan || 'free',
      subscriptionStatus: org.subscriptionStatus || 'active',
      customMaxStorageBytes: org.customMaxStorageBytes ? org.customMaxStorageBytes.toString() : null,
    }));

    return NextResponse.json({ organizations: formattedOrgs });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
