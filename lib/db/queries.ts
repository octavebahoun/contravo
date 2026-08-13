import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { auditLogs, memberships, organizations, users } from './schema';
import { getSession } from '@/lib/auth/session';

export async function getUser() {
  return getSession();
}

export async function getOrganizationByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.stripeCustomerId, customerId), isNull(organizations.deletedAt)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateOrganizationSubscription(
  orgId: string,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(organizations)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(organizations.id, orgId));
}

export async function getUserWithOrganization(userId: string) {
  const result = await db
    .select({
      user: users,
      organizationId: memberships.organizationId
    })
    .from(users)
    .leftJoin(memberships, eq(users.id, memberships.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getUserWithTeam(userId: string) {
  const result = await getUserWithOrganization(userId);
  return result ? { user: result.user, teamId: result.organizationId } : null;
}

export async function getTeamByStripeCustomerId(customerId: string) {
  return getOrganizationByStripeCustomerId(customerId);
}

export async function updateTeamSubscription(
  teamId: string,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  return updateOrganizationSubscription(teamId, subscriptionData);
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    return [];
  }

  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      timestamp: auditLogs.createdAt,
      ipAddress: auditLogs.ipAddress,
      userName: users.fullName
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(eq(auditLogs.actorUserId, user.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  return logs;
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const firstMembership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, user.id),
    with: {
      organization: {
        with: {
          memberships: {
            with: {
              user: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!firstMembership || !firstMembership.organization) {
    return null;
  }

  const org = firstMembership.organization;
  return {
    ...org,
    teamMembers: org.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        name: m.user.fullName,
        email: m.user.email
      }
    }))
  };
}
