import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { runInvoiceReminderSweep } from '@/lib/workflows/invoice-reminders';
import { rateLimitIp } from '@/lib/rate-limit';

/**
 * Chases unpaid invoices at J+7, J+14 and J+30 (MVP5 §3.2).
 *
 * Lives outside `/api/v1` for the same reason as the webhook retry sweep: the v1
 * middleware resolves an organization from the caller's credentials, and this
 * sweep is platform-wide. It authenticates itself with `CRON_SECRET`.
 *
 * Driven by the n8n Schedule workflow `cron_invoice_reminders_v1.json`, daily.
 * Safe to run twice: each notice is claimed through a unique
 * `(invoice_id, stage)` index before anything is emitted.
 */

/**
 * Constant-time bearer check.
 *
 * Both sides are hashed to a fixed width first: `timingSafeEqual` throws on a
 * length mismatch, and that would also leak the secret's length.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Fail closed: an unset secret must not mean an open endpoint.
  if (!expected) {
    console.error('CRON_SECRET is not set — refusing to run the invoice reminder sweep.');
    return false;
  }

  const header = request.headers.get('authorization') || '';
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!provided) return false;

  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  const rateLimitResult = await rateLimitIp(ip, 60);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      { status: 429 }
    );
  }

  if (!isAuthorized(request)) {
    // Deliberately uninformative: this must not help distinguish "no secret
    // configured" from "wrong secret".
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '', 10);
    const result = await runInvoiceReminderSweep({
      limit: Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : undefined,
    });

    if (result.remindersSent > 0 || result.failures > 0) {
      console.log(
        `Invoice reminder sweep: sent=${result.remindersSent} markedOverdue=${result.markedOverdue} ` +
          `alreadySent=${result.alreadySent} failures=${result.failures}`
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Invoice reminder sweep failed:', error);
    return NextResponse.json(
      { error: 'internal_server_error', message: 'Reminder sweep failed' },
      { status: 500 }
    );
  }
}
