import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getProjectMembers, addProjectMember } from '@/lib/repositories/projects.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['lead', 'contributor', 'observer']),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:read');

    const members = await getProjectMembers(ctx.organizationId, id);

    return NextResponse.json({ members });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:write');

    const body = await request.json();
    const { userId, role } = addMemberSchema.parse(body);

    const member = await addProjectMember(
      ctx.organizationId,
      id,
      userId,
      role,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
