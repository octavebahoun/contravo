import { NextRequest, NextResponse } from 'next/server';
import { rateLimitIp } from '@/lib/rate-limit';
import { processGeniusPayWebhook } from '@/lib/payments/geniuspay/payment-intents.service';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  // 1. Dedicated rate limiting (500/min/IP)
  const rateLimitResult = await rateLimitIp(ip, 500);
  if (!rateLimitResult.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        message: 'Too many webhook requests from this IP',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  // 2. Extract headers
  const headersMap: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headersMap[key.toLowerCase()] = value;
  });

  // 3. Get raw body
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    return new NextResponse(
      JSON.stringify({
        error: 'bad_request',
        message: 'Could not read request body',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 4. Process webhook with the 9-step security pipeline
  try {
    const result = await processGeniusPayWebhook(headersMap, rawBody, ip);
    return new NextResponse(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(rateLimitResult.limit),
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      },
    });
  } catch (error: any) {
    console.error('Webhook processing system error:', error);
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'internal_server_error',
        message: error.message || 'An error occurred while processing the webhook event',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
