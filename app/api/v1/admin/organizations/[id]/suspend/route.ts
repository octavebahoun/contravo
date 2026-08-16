import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { formatErrorResponse } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import { organizations, subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const suspendSchema = z.object({
  action: z.enum(['suspend', 'reactivate']),
});

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  segmentData: { params: Params }
) {
  try {
    await requireSuperAdmin();
    const { id } = await segmentData.params;

    const body = await request.json();
    const { action } = suspendSchema.parse(body);

    const statusValue = action === 'suspend' ? 'suspended' : 'active';

    // 1. Update organization table
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        subscriptionStatus: statusValue,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();

    if (!updatedOrg) {
      return NextResponse.json({ error: 'not_found', message: 'Organisation non trouvée' }, { status: 404 });
    }

    // 2. Update subscriptions table
    await db
      .update(subscriptions)
      .set({
        status: statusValue,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, id));

    return NextResponse.json({
      success: true,
      subscriptionStatus: statusValue,
      message: `L'organisation a été ${action === 'suspend' ? 'suspendue' : 'réactivée'} avec succès.`,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
