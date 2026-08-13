import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { invitations, memberships } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { acceptInvitationSchema } from '@/lib/validation';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const user = await getSession();
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'You must be signed in to accept an invitation', 401);
    }

    const body = await request.json();
    const validated = acceptInvitationSchema.parse(body);

    const token = validated.token.startsWith('invite-')
      ? validated.token.substring('invite-'.length)
      : validated.token;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Retrieve invitation
    const result = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.acceptedAt)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError('INVALID_TOKEN', 'Invitation is invalid, has already been accepted, or is revoked', 400);
    }

    const invitation = result[0];

    // Check expiration
    if (new Date(invitation.expiresAt) < new Date()) {
      throw new ApiError('INVALID_TOKEN', 'This invitation has expired', 400);
    }

    // Check if user is already a member
    const existingMembership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.organizationId, invitation.organizationId)
        )
      )
      .limit(1);

    if (existingMembership.length > 0) {
      // Mark invitation accepted anyway so it's consumed
      await db
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      return NextResponse.json({
        success: true,
        message: 'You are already a member of this organization',
        membership: existingMembership[0],
      });
    }

    // Accept invitation and create membership in a transaction
    const membership = await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      const [newMem] = await tx
        .insert(memberships)
        .values({
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
        })
        .returning();

      return newMem;
    });

    const ipAddress = request.headers.get('x-forwarded-for') || (request as any).ip || undefined;
    await createAuditLog({
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      action: 'member.invite.accept',
      ipAddress,
      metadata: { invitationId: invitation.id, role: invitation.role },
    });

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully',
      membership,
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
