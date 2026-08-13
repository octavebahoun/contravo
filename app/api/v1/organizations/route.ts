import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/drizzle';
import { organizations, memberships } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createOrgSchema } from '@/lib/validation';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'You must be signed in to perform this action', 401);
    }

    const orgsList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(eq(memberships.userId, user.id));

    return NextResponse.json({ organizations: orgsList });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'You must be signed in to perform this action', 401);
    }

    const body = await request.json();
    const validated = createOrgSchema.parse(body);

    // Check if slug is taken
    const existing = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, validated.slug.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError('ALREADY_EXISTS', 'An organization with this slug already exists', 409);
    }

    // Insert organization and membership within a transaction
    const { organization, membership } = await db.transaction(async (tx) => {
      const [newOrg] = await tx
        .insert(organizations)
        .values({
          name: validated.name,
          slug: validated.slug.toLowerCase().trim(),
        })
        .returning();

      const [newMem] = await tx
        .insert(memberships)
        .values({
          userId: user.id,
          organizationId: newOrg.id,
          role: 'owner',
        })
        .returning();

      return { organization: newOrg, membership: newMem };
    });

    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    await createAuditLog({
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'organization.create',
      ipAddress,
      metadata: { name: organization.name, slug: organization.slug },
    });

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
        createdAt: organization.createdAt,
      },
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
