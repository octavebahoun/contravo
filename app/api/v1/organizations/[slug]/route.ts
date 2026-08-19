import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { updateOrgSchema } from '@/lib/validation';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    
    // Check if soft deleted
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, context.organization.id))
      .limit(1);

    if (!org || org.deletedAt) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        autoRemindersEnabled: org.autoRemindersEnabled,
        createdAt: org.createdAt,
        role: context.organization.role,
      },
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    const body = await request.json();
    const validated = updateOrgSchema.parse(body);

    // Only what was actually sent: the settings screen patches the reminder
    // toggle alone, and spelling out `name: undefined` here would blank it.
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.autoRemindersEnabled !== undefined
          ? { autoRemindersEnabled: validated.autoRemindersEnabled }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, context.organization.id))
      .returning();

    await context.audit('organization.update', validated);

    return NextResponse.json({
      organization: {
        id: updatedOrg.id,
        name: updatedOrg.name,
        slug: updatedOrg.slug,
        autoRemindersEnabled: updatedOrg.autoRemindersEnabled,
        createdAt: updatedOrg.createdAt,
        role: context.organization.role,
      },
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.delete');

    // Soft delete: set deletedAt
    const [deletedOrg] = await db
      .update(organizations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, context.organization.id))
      .returning();

    await context.audit('organization.delete', { slug });

    return NextResponse.json({ success: true, message: 'Organization soft deleted' });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}
