import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { invitations, users } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { inviteMemberSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';
import crypto from 'crypto';

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

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(invitations)
      .values({
        organizationId: context.organization.id,
        email: validated.email.toLowerCase().trim(),
        role: validated.role,
        tokenHash,
        expiresAt,
        invitedBy: context.user.id,
      })
      .returning();

    // Log the token in development/test environments
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INVITATION_TOKEN] invite-${token}`);
    }

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
