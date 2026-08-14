import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { initiateUpload } from '@/lib/storage/upload-service';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const presignSchema = z.object({
  kind: z.enum([
    'quote_pdf',
    'contract_pdf',
    'contract_signed_pdf',
    'invoice_pdf',
    'deliverable',
    'expense_receipt',
    'signature_canvas',
    'attachment',
  ]),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  linkedEntityType: z.string().optional().nullable(),
  linkedEntityId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'files:write');

    const body = await request.json();
    const validated = presignSchema.parse(body);

    const { fileId, uploadUrl, r2Key } = await initiateUpload({
      orgId: ctx.organizationId,
      userId: ctx.userId || 'system',
      kind: validated.kind,
      filename: validated.filename,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      linkedEntityType: validated.linkedEntityType,
      linkedEntityId: validated.linkedEntityId,
      uploadedVia: ctx.authType === 'api_key' ? 'api' : 'web',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1',
    });

    return NextResponse.json(
      {
        fileId,
        uploadUrl,
        r2Key,
        requiredHeaders: {
          'content-type': validated.mimeType,
          'content-length': String(validated.sizeBytes),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}
