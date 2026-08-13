import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug, id } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'member.invite');

    const result = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.organizationId, context.organization.id)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError('NOT_FOUND', 'Invitation not found', 404);
    }

    const invitation = result[0];

    await db.delete(invitations).where(eq(invitations.id, invitation.id));

    await context.audit('member.invite.cancel', {
      email: invitation.email,
      role: invitation.role,
      invitationId: invitation.id,
    });

    return NextResponse.json({ success: true, message: 'Invitation cancelled successfully' });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
