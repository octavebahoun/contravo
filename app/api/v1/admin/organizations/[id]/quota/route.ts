import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { formatErrorResponse } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import { organizations } from '@/lib/db/schema';
import { recomputeQuotaUsage } from '@/lib/billing/quotas.service';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const quotaUpdateSchema = z.object({
  customMaxMembers: z.number().nullable().optional(),
  customMaxClients: z.number().nullable().optional(),
  customMaxProjects: z.number().nullable().optional(),
  customMaxStorageBytes: z.union([z.number(), z.string()]).nullable().optional(),
  customMaxApiKeys: z.number().nullable().optional(),
  customMaxWebhookEndpoints: z.number().nullable().optional(),
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
    const validated = quotaUpdateSchema.parse(body);

    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (validated.customMaxMembers !== undefined) {
      updateFields.customMaxMembers = validated.customMaxMembers;
    }
    if (validated.customMaxClients !== undefined) {
      updateFields.customMaxClients = validated.customMaxClients;
    }
    if (validated.customMaxProjects !== undefined) {
      updateFields.customMaxProjects = validated.customMaxProjects;
    }
    if (validated.customMaxStorageBytes !== undefined) {
      updateFields.customMaxStorageBytes =
        validated.customMaxStorageBytes === null ? null : BigInt(validated.customMaxStorageBytes);
    }
    if (validated.customMaxApiKeys !== undefined) {
      updateFields.customMaxApiKeys = validated.customMaxApiKeys;
    }
    if (validated.customMaxWebhookEndpoints !== undefined) {
      updateFields.customMaxWebhookEndpoints = validated.customMaxWebhookEndpoints;
    }

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateFields)
      .where(eq(organizations.id, id))
      .returning();

    if (!updatedOrg) {
      return NextResponse.json({ error: 'not_found', message: 'Organisation non trouvée' }, { status: 404 });
    }

    await recomputeQuotaUsage(id);

    return NextResponse.json({
      success: true,
      organization: {
        ...updatedOrg,
        customMaxStorageBytes: updatedOrg.customMaxStorageBytes ? updatedOrg.customMaxStorageBytes.toString() : null,
      },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
