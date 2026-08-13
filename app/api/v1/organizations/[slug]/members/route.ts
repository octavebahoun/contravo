import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { memberships, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'member.list');

    const membersList = await db
      .select({
        id: memberships.id,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
        user: {
          id: users.id,
          email: users.email,
          fullName: users.fullName,
        },
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, context.organization.id));

    return NextResponse.json({ members: membersList });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
