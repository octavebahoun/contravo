import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { contracts, organizations } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { requirePortalAccess } from '@/lib/portal/portal-guard';

/**
 * Contract as seen by the client in the portal (MVP4 §7.1).
 *
 * Returns the markdown body so the page can render the terms inline, plus the
 * signature state that decides whether the signing panel is shown.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('read');
    const { id } = await params;

    const [contract] = await db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.id, id),
          eq(contracts.organizationId, ctx.organizationId),
          isNull(contracts.deletedAt)
        )
      )
      .limit(1);

    if (!contract) {
      throw new ApiError('NOT_FOUND', 'Contract not found', 404);
    }

    const [org] = await db
      .select({ name: organizations.name, brandColor: organizations.brandColor })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);

    return NextResponse.json({
      contract: {
        id: contract.id,
        number: contract.number,
        title: contract.title,
        status: contract.status,
        bodyMarkdown: contract.bodyMarkdown,
        sentAt: contract.sentAt,
        signedAt: contract.signedAt,
        signedByName: contract.signedByName,
        expiresAt: contract.expiresAt,
        createdAt: contract.createdAt,
        hasSignedPdf: Boolean(contract.signedPdfFileId),
      },
      organization: org ? { name: org.name, brandColor: org.brandColor } : null,
      recipientEmail: ctx.recipientEmail ?? null,
      canSign:
        contract.status === 'sent' &&
        !contract.signedAt &&
        (ctx.scopes.includes('sign') || ctx.scopes.includes('*')),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
