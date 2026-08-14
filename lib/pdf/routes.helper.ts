import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { contracts, files, invoices, quotes } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { formatErrorResponse } from '@/lib/errors';
import { getPresignedGetUrl } from '@/lib/storage/presign';
import {
  generateContractPdf,
  generateInvoicePdf,
  generateQuotePdf,
} from './generate.service';

/**
 * Shared handlers for the generated-PDF routes (MVP4 §8.2).
 *
 * The seven endpoints differ only by entity, so the download/regenerate logic
 * lives here once instead of being copied per route file.
 */

export type PdfEntity = 'quote' | 'invoice' | 'contract';

const ENTITY_CONFIG = {
  quote: { table: quotes, scope: 'quotes', generate: generateQuotePdf },
  invoice: { table: invoices, scope: 'invoices', generate: generateInvoicePdf },
  contract: { table: contracts, scope: 'contracts', generate: generateContractPdf },
} as const;

/**
 * Loads an entity row scoped to the caller's organization.
 *
 * @throws ApiError 404 when it does not exist or belongs to another tenant.
 */
async function loadEntity(entity: PdfEntity, id: string, organizationId: string) {
  const table = ENTITY_CONFIG[entity].table;

  const [row] = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.id, id),
        eq(table.organizationId, organizationId),
        isNull(table.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    throw new ApiError('NOT_FOUND', `${entity} not found`, 404);
  }
  return row as Record<string, any>;
}

/**
 * Redirects to a short-lived presigned URL for an entity's PDF (§8.2).
 *
 * Generates the document on the fly when it has never been rendered, so a
 * download never 404s on a valid entity.
 *
 * @param signed - When true, serves the signed contract PDF instead.
 */
export async function handlePdfDownload(
  request: NextRequest,
  entity: PdfEntity,
  id: string,
  options: { signed?: boolean } = {}
): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') || undefined;

  try {
    const ctx = await getApiContext();
    checkScope(ctx, `${ENTITY_CONFIG[entity].scope}:read`);

    const row = await loadEntity(entity, id, ctx.organizationId);
    const ip = request.headers.get('x-forwarded-for') || undefined;

    let fileId: string | null = options.signed ? row.signedPdfFileId : row.pdfFileId;

    if (options.signed && !fileId) {
      throw new ApiError('NOT_FOUND', 'Contract has not been signed yet', 404);
    }

    if (!fileId) {
      const generated = await ENTITY_CONFIG[entity].generate(id, ctx.organizationId, ip);
      fileId = generated.fileId;
    }

    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    if (!file) {
      throw new ApiError('NOT_FOUND', 'PDF file not found', 404);
    }

    // 60 minutes: long enough for n8n to fetch and attach it to an email
    // (MVP5 §5.4) without leaving a long-lived public link.
    const url = await getPresignedGetUrl(file.r2Key, ctx.organizationId, 3600, file.filename);

    return NextResponse.redirect(url, 302);
  } catch (err) {
    return formatErrorResponse(err, requestId);
  }
}

/**
 * Re-renders an entity's PDF (§8.2).
 *
 * Restricted to states where the document is not yet contractually binding:
 * regenerating a sent quote or a signed contract would invalidate a hash the
 * counterparty already holds.
 */
export async function handlePdfRegenerate(
  request: NextRequest,
  entity: PdfEntity,
  id: string
): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') || undefined;

  try {
    const ctx = await getApiContext();
    checkScope(ctx, `${ENTITY_CONFIG[entity].scope}:write`);

    const row = await loadEntity(entity, id, ctx.organizationId);

    if (entity === 'contract' && row.status !== 'draft') {
      throw new ApiError(
        'CONFLICT',
        `Contracts can only be regenerated while in draft (current: ${row.status})`,
        409
      );
    }
    if (row.status === 'signed' || row.signedAt) {
      throw new ApiError('CONFLICT', 'A signed document cannot be regenerated', 409);
    }

    const ip = request.headers.get('x-forwarded-for') || undefined;
    const generated = await ENTITY_CONFIG[entity].generate(id, ctx.organizationId, ip);

    return NextResponse.json({
      fileId: generated.fileId,
      sha256: generated.sha256,
      sizeBytes: generated.sizeBytes,
      templateVersion: generated.templateVersion,
    });
  } catch (err) {
    return formatErrorResponse(err, requestId);
  }
}
