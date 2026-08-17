import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/rbac';
import { QuotaExceededError } from '@/lib/billing/quotas.service';
import { z } from 'zod';

export function formatErrorResponse(error: unknown, requestId?: string) {
  const reqId = requestId || `req_${Math.random().toString(36).substring(2, 11)}`;

  // Quota rejections are a normal business outcome (MVP6 §1.1), not a fault:
  // without this branch they would surface as a 500 and the UI could not tell
  // the user which limit was reached.
  if (error instanceof QuotaExceededError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: {
            quotaKey: error.quotaKey,
            current: error.current,
            limit: error.limit,
            planId: error.planId,
          },
          requestId: reqId,
        },
      },
      { status: error.status }
    );
  }

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

  // BillingServiceError, matched by name rather than by import: pulling it in
  // from saas-billing.service would drag the payment client and the DB into
  // every module that only wants to format an error.
  if (
    error instanceof Error &&
    error.name === 'BillingServiceError' &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'BILLING_ERROR',
          message: error.message,
          details: null,
          requestId: reqId,
        },
      },
      { status: (error as unknown as { statusCode: number }).statusCode }
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
