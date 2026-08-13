import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { removeProjectMember } from '@/lib/repositories/projects.repo';
import { formatErrorResponse } from '@/lib/errors';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params;
    const ctx = await getApiContext();
    // Enforce projects:delete scope to prevent members from deleting
    checkScope(ctx, 'projects:delete');

    await removeProjectMember(
      ctx.organizationId,
      id,
      userId,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
