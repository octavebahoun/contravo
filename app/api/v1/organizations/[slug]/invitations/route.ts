import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { invitations, users } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { inviteMemberSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';
import { createOrganizationInvitation } from '@/lib/invitations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'member.invite');

    const pendingInvitations = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        invitedBy: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(invitations)
      .innerJoin(users, eq(invitations.invitedBy, users.id))
      .where(
        and(
          eq(invitations.organizationId, context.organization.id),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date())
        )
      );

    return NextResponse.json({ invitations: pendingInvitations });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'member.invite');

    const body = await request.json();
    const validated = inviteMemberSchema.parse(body);

    // Duplicate checks, quota, token and the email event all live in the
    // service, shared with the dashboard's own invite form.
    const { invitation, token } = await createOrganizationInvitation({
      organizationId: context.organization.id,
      email: validated.email,
      role: validated.role,
      invitedByUserId: context.user.id,
    });

    await context.audit('member.invite', {
      email: validated.email,
      role: validated.role,
      invitationId: invitation.id,
    });

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
      // Return raw token in JSON for tests/dev convenience
      token: process.env.NODE_ENV !== 'production' ? token : undefined,
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
