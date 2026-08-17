import { db } from '@/lib/db/drizzle';
import { invoiceReminders, invoices } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { emit } from '@/lib/webhooks';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';
import { transitionInvoice } from '@/lib/workflows/invoice.state';

/**
 * Invoice dunning sweep (MVP5 §3.2).
 *
 * MVP5 specifies reminders at J+7, J+14 and J+30 past the due date. The pieces
 * existed — the `mark_overdue` transition, the `invoice.overdue` event, the
 * `email_invoice_overdue_v1` workflow — but **nothing ever triggered them**: the
 * only path was a human clicking a button, so an unpaid invoice was silently
 * forgotten. This is the missing scheduler's work.
 *
 * Runs daily and is idempotent by construction: each notice inserts a row into
 * `invoice_reminders`, whose unique `(invoice_id, stage)` index makes a second
 * send for the same stage impossible even if two sweeps overlap.
 */

/** Days past due at which a notice goes out. `0` is the day the due date passes. */
export const REMINDER_STAGES = [0, 7, 14, 30] as const;

/** Statuses that still owe money and may therefore be chased. */
const CHASEABLE = ['sent', 'partial', 'overdue'] as const;

export type ReminderSweepResult = {
  /** Invoices moved from `sent`/`partial` to `overdue`. */
  markedOverdue: number;
  /** Notices sent, one entry per (invoice, stage). */
  remindersSent: number;
  /** Stages skipped because they had already been sent. */
  alreadySent: number;
  /** Invoices whose processing threw; the sweep continues past them. */
  failures: number;
  details: {
    invoiceId: string;
    number: string;
    stage: number;
    daysOverdue: number;
    outcome: 'sent' | 'already_sent' | 'failed';
    error?: string;
  }[];
};

/**
 * Sends every notice that is due and not yet recorded.
 *
 * @param options.now - Overrides "today", for tests. Compared in SQL against
 *   `due_date`, a `date` column, so only the calendar day matters.
 * @param options.limit - Caps invoices examined per run, so one very large
 *   backlog cannot make the request time out.
 */
export async function runInvoiceReminderSweep(options?: {
  now?: Date;
  limit?: number;
}): Promise<ReminderSweepResult> {
  const limit = options?.limit ?? 200;
  const today = options?.now ?? new Date();
  const todayDate = today.toISOString().split('T')[0];

  const result: ReminderSweepResult = {
    markedOverdue: 0,
    remindersSent: 0,
    alreadySent: 0,
    failures: 0,
    details: [],
  };

  // Only invoices actually past due and still owing something. `amount_due_cents`
  // is a generated column, so a fully paid invoice cannot slip through here.
  const candidates = await db
    .select({
      id: invoices.id,
      organizationId: invoices.organizationId,
      number: invoices.number,
      status: invoices.status,
      dueDate: invoices.dueDate,
      amountDueCents: invoices.amountDueCents,
      daysOverdue: sql<number>`(${todayDate}::date - ${invoices.dueDate})::int`,
    })
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, [...CHASEABLE]),
        sql`${invoices.deletedAt} is null`,
        sql`${invoices.dueDate} < ${todayDate}::date`,
        sql`${invoices.amountDueCents} > 0`
      )
    )
    .orderBy(invoices.dueDate)
    .limit(limit);

  for (const invoice of candidates) {
    const daysOverdue = Number(invoice.daysOverdue);

    // Highest stage reached, so an invoice discovered late (or after an outage)
    // gets the notice it is actually due rather than replaying the whole ladder.
    const stage = [...REMINDER_STAGES].reverse().find((s) => daysOverdue >= s);
    if (stage === undefined) continue;

    try {
      // Claim the notice first. A unique violation means another run already
      // sent this stage, so nothing more is owed here.
      const inserted = await db
        .insert(invoiceReminders)
        .values({
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          stage,
          daysOverdue,
          amountDueCents: BigInt(invoice.amountDueCents ?? 0n),
        })
        .onConflictDoNothing({
          target: [invoiceReminders.invoiceId, invoiceReminders.stage],
        })
        .returning({ id: invoiceReminders.id });

      if (inserted.length === 0) {
        result.alreadySent += 1;
        result.details.push({
          invoiceId: invoice.id,
          number: invoice.number,
          stage,
          daysOverdue,
          outcome: 'already_sent',
        });
        continue;
      }

      if (invoice.status !== 'overdue') {
        // `mark_overdue` emits `invoice.overdue` itself, so that transition *is*
        // this invoice's notice — emitting again here would send two emails at
        // once. The event carries no `reminderStage` in that case, and the
        // template falls back to its neutral wording. On the normal daily
        // cadence this only ever happens at stage 0; a higher stage means the
        // invoice was discovered late, after an outage or on the first run.
        await transitionInvoice(invoice.organizationId, invoice.id, 'mark_overdue', null, null);

        result.markedOverdue += 1;
        result.remindersSent += 1;
        result.details.push({
          invoiceId: invoice.id,
          number: invoice.number,
          stage,
          daysOverdue,
          outcome: 'sent',
        });
        continue;
      }

      const [current] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoice.id))
        .limit(1);

      const payload = await buildEventPayload({
        organizationId: invoice.organizationId,
        entityKind: 'invoice',
        entityId: invoice.id,
        entity: current ?? invoice,
        withPortalUrl: true,
        // `reminderStage` lets the email template escalate its wording; without
        // it the same message would be repeated at J+7, J+14 and J+30.
        extra: { reminderStage: stage, daysOverdue },
      });

      await emit('invoice.overdue', invoice.organizationId, payload);

      result.remindersSent += 1;
      result.details.push({
        invoiceId: invoice.id,
        number: invoice.number,
        stage,
        daysOverdue,
        outcome: 'sent',
      });
    } catch (error: any) {
      // Release the claim so the next sweep retries. Keeping it would turn a
      // transient failure — a Resend hiccup, a dropped connection — into a
      // reminder that is never sent, with the row asserting it was.
      await db
        .delete(invoiceReminders)
        .where(
          and(eq(invoiceReminders.invoiceId, invoice.id), eq(invoiceReminders.stage, stage))
        )
        .catch((cleanupError) => {
          console.error(`Failed to release reminder claim for ${invoice.number}:`, cleanupError);
        });

      // One bad invoice must not stop the others from being chased.
      result.failures += 1;
      result.details.push({
        invoiceId: invoice.id,
        number: invoice.number,
        stage,
        daysOverdue,
        outcome: 'failed',
        error: error?.message || String(error),
      });
      console.error(`Invoice reminder failed for ${invoice.number} (stage ${stage}):`, error);
    }
  }

  return result;
}
