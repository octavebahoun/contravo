import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { organizations, quoteItems, quotes } from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { requirePortalAccess } from '@/lib/portal/portal-guard';

/**
 * Quote as seen by the client in the portal (MVP2 §3, MVP3 §5).
 *
 * Exposes only what the recipient needs to decide: the issuer, the line items
 * and the totals. Internal fields — creator, margins, project links, audit
 * timestamps — never cross into the portal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('read');
    const { id } = await params;

    const [quote] = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.id, id),
          eq(quotes.organizationId, ctx.organizationId),
          isNull(quotes.deletedAt)
        )
      )
      .limit(1);

    if (!quote) {
      throw new ApiError('NOT_FOUND', 'Quote not found', 404);
    }

    const items = await db
      .select({
        position: quoteItems.position,
        description: quoteItems.description,
        quantity: quoteItems.quantity,
        unit: quoteItems.unit,
        unitPriceCents: quoteItems.unitPriceCents,
        discountBps: quoteItems.discountBps,
        amountCents: quoteItems.amountCents,
      })
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.position));

    const [org] = await db
      .select({ name: organizations.name, brandColor: organizations.brandColor })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);

    // Viewing the quote is itself a business signal (MVP3 §3): the first open
    // moves it out of `sent`. Best-effort — a failed update must not blank the page.
    if (quote.status === 'sent') {
      try {
        const { transitionQuote } = await import('@/lib/workflows/quote.state');
        await transitionQuote(
          ctx.organizationId,
          id,
          'view',
          undefined,
          null,
          request.headers.get('x-forwarded-for') || null
        );
      } catch {
        // Ignored on purpose: the client must still see their quote.
      }
    }

    return NextResponse.json({
      quote: {
        id: quote.id,
        number: quote.number,
        status: quote.status,
        currency: quote.currency,
        subtotalCents: Number(quote.subtotalCents),
        discountCents: Number(quote.discountCents),
        taxRateBps: quote.taxRateBps,
        taxCents: Number(quote.taxCents),
        totalCents: Number(quote.totalCents),
        validUntil: quote.validUntil,
        notes: quote.notes,
        terms: quote.terms,
        sentAt: quote.sentAt,
        acceptedAt: quote.acceptedAt,
        rejectedAt: quote.rejectedAt,
        createdAt: quote.createdAt,
        items: items.map((item) => ({
          ...item,
          unitPriceCents: Number(item.unitPriceCents),
          amountCents: Number(item.amountCents),
        })),
      },
      organization: org ? { name: org.name, brandColor: org.brandColor } : null,
      recipientEmail: ctx.recipientEmail ?? null,
      canSign: ctx.scopes.includes('sign') || ctx.scopes.includes('*'),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
