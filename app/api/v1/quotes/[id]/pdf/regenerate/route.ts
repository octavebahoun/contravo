import { NextRequest } from 'next/server';
import { handlePdfRegenerate } from '@/lib/pdf/routes.helper';

/** POST /api/v1/quotes/:id/pdf/regenerate → re-renders the PDF (MVP4 §8.2). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handlePdfRegenerate(request, 'quote', id);
}
