import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { memberships } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { updateMemberRoleSchema } from '@/lib/validation';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug, userId } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'member.role.change');

    const body = await request.json();
    const validated = updateMemberRoleSchema.parse(body);

    // Get the target membership
    const targetMembership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, context.organization.id),
          eq(memberships.userId, userId)
        )
      )
      .limit(1);

    if (targetMembership.length === 0) {
      throw new ApiError('NOT_FOUND', 'Membership not found in this organization', 404);
    }

    const target = targetMembership[0];

    // Enforce constraints: if target is the user themselves
    if (userId === context.user.id) {
      // Cannot change your own role if you are owner and there are no other owners
      if (target.role === 'owner' && (validated.role as string) !== 'owner') {
        const otherOwners = await db
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, context.organization.id),
              eq(memberships.role, 'owner'),
              ne(memberships.userId, context.user.id)
            )
          )
          .limit(1);

        if (otherOwners.length === 0) {
          throw new ApiError(
            'BAD_REQUEST',
            'You cannot demote yourself. You are the only owner of this organization. Transfer ownership first.',
            400
          );
        }
      }
    }

    const [updated] = await db
      .update(memberships)
      .set({ role: validated.role })
      .where(eq(memberships.id, target.id))
      .returning();

    await context.audit('member.role.change', {
      targetUserId: userId,
      oldRole: target.role,
      newRole: validated.role,
    });

    return NextResponse.json({ membership: updated });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug, userId } = await params;
    const context = await requireOrg(slug);

    // Authorization check: either removing self or has member.remove permission
    const isRemovingSelf = userId === context.user.id;
    if (!isRemovingSelf) {
      requirePermission(context, 'member.remove');
    }

    // Get the target membership
    const targetMembership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, context.organization.id),
          eq(memberships.userId, userId)
        )
      )
      .limit(1);

    if (targetMembership.length === 0) {
      throw new ApiError('NOT_FOUND', 'Membership not found in this organization', 404);
    }

    const target = targetMembership[0];

    // Enforce constraints: owner leaving
    if (target.role === 'owner') {
      const otherOwners = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, context.organization.id),
            eq(memberships.role, 'owner'),
            ne(memberships.userId, userId)
          )
        )
        .limit(1);

      if (otherOwners.length === 0) {
        throw new ApiError(
          'BAD_REQUEST',
          'You cannot remove the only owner of this organization. Transfer ownership first.',
          400
        );
      }
    }

    await db.delete(memberships).where(eq(memberships.id, target.id));

    await context.audit('member.remove', {
      targetUserId: userId,
      isSelf: isRemovingSelf,
    });

    return NextResponse.json({ success: true, message: 'Member removed from organization' });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
