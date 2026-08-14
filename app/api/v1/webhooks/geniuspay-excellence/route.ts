import { NextRequest, NextResponse } from 'next/server';
import { rateLimitIp } from '@/lib/rate-limit';
import { processExcellenceWebhook } from '@/lib/billing/saas-billing.service';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  // 1. Rate limiting (500/min/IP)
  const rateLimitResult = await rateLimitIp(ip, 500);
  if (!rateLimitResult.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        message: 'Trop de requêtes webhook depuis cette adresse IP',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
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
        message: 'Impossible de lire le corps de la requête',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 4. Process GeniusPay Excellence webhook
  try {
    const result = await processExcellenceWebhook(headersMap, rawBody, ip);
    return new NextResponse(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Erreur traitement GeniusPay Excellence Webhook:', error);
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'internal_server_error',
        message: error.message || 'Une erreur est survenue',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
