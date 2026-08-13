import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

export function formatErrorResponse(error: unknown, requestId?: string) {
  const reqId = requestId || `req_${Math.random().toString(36).substring(2, 11)}`;

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details || null,
          requestId: reqId,
        },
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some input validation checks failed.',
          details: error.flatten().fieldErrors,
          requestId: reqId,
        },
      },
      { status: 400 }
    );
  }

  console.error(`[${reqId}] Internal server error:`, error);
  
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: null,
        requestId: reqId,
      },
    },
    { status: 500 }
  );
}
