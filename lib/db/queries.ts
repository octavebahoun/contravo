import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { auditLogs, memberships, organizations, users } from './schema';
import { getSession } from '@/lib/auth/session';
import { cookies } from 'next/headers';

export async function getUser() {
  return getSession();
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

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get('organization_id')?.value;

  let membership = null;
  if (activeOrgId) {
    membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.userId, user.id), eq(memberships.organizationId, activeOrgId)),
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
  }

  if (!membership) {
    membership = await db.query.memberships.findFirst({
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
  }

  if (!membership || !membership.organization) {
    return null;
  }

  const org = membership.organization;
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
