import { NextRequest } from 'next/server';
import { handlePdfDownload } from '@/lib/pdf/routes.helper';

/** GET /api/v1/contracts/:id/signed-pdf/download → signed PDF only (MVP4 §8.2). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handlePdfDownload(request, 'contract', id, { signed: true });
}
