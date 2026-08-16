import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/drizzle';
import { memberships, organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'You must be signed in to perform this action', 401);
    }

    // Get user's organizations
    const userMemberships = await db
      .select({
        id: memberships.id,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
        organization: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        },
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(eq(memberships.userId, user.id));

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerifiedAt: user.emailVerifiedAt,
        isSuperAdmin: user.isSuperAdmin,
      },
      memberships: userMemberships,
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
