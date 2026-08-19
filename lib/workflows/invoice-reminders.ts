import { db } from '@/lib/db/drizzle';
import { invoiceReminders, invoices, organizations } from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
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
 *
 * The ladder is now **opt-in**, per organization. Firing it on everyone took the
 * decision to chase a client out of the provider's hands, and that is a
 * commercial call, not a technical one: `sendManualReminder` below is the normal
 * path, and `organizations.auto_reminders_enabled` re-arms the ladder for anyone
 * who wants it back.
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
  // is a generated column, so a fully paid invoice cannot slip through here. The
  // join is the opt-in gate: an organization that never asked for the automatic
  // ladder is not chased at all.
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
    .innerJoin(organizations, eq(organizations.id, invoices.organizationId))
    .where(
      and(
        eq(organizations.autoRemindersEnabled, true),
        sql`${organizations.deletedAt} is null`,
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
          kind: 'auto',
        })
        .onConflictDoNothing({
          // The unique index is partial — `where kind = 'auto'` — so the
          // predicate has to be repeated here for Postgres to infer it.
          target: [invoiceReminders.invoiceId, invoiceReminders.stage],
          where: sql`kind = 'auto'`,
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
          and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.stage, stage),
            eq(invoiceReminders.kind, 'auto')
          )
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

/** Minimum delay between two manual notices on the same invoice. */
export const MANUAL_REMINDER_COOLDOWN_HOURS = 24;

export type ManualReminderResult = {
  reminderId: string;
  stage: number;
  daysOverdue: number;
  /** The invoice moved to `overdue` on the way, which is itself the notice. */
  markedOverdue: boolean;
  sentAt: string;
};

/**
 * Sends one reminder, because a human asked for it.
 *
 * This is the path the automatic ladder used to monopolise. It reuses the same
 * `invoice.overdue` event and therefore the same `email_invoice_overdue_v1`
 * template, escalating its wording through `reminderStage` exactly as the sweep
 * does — a client chased by hand does not get a different-looking email from one
 * chased by the scheduler.
 *
 * Refused before the due date on purpose: that template states the deadline has
 * passed, and sending it early would make the message untrue. Refused twice in
 * the same day for the same reason a person would not do it — a reminder that
 * arrives every hour stops being read.
 */
export async function sendManualReminder(input: {
  organizationId: string;
  invoiceId: string;
  userId?: string | null;
  now?: Date;
}): Promise<ManualReminderResult> {
  const { organizationId, invoiceId, userId } = input;
  const now = input.now ?? new Date();
  const todayDate = now.toISOString().split('T')[0];

  const [invoice] = await db
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
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, organizationId),
        sql`${invoices.deletedAt} is null`
      )
    )
    .limit(1);

  if (!invoice) {
    throw new ApiError('NOT_FOUND', 'Facture introuvable.', 404);
  }

  if (!CHASEABLE.includes(invoice.status as (typeof CHASEABLE)[number])) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Une facture « ${invoice.status} » ne se relance pas.`,
      400
    );
  }

  if (Number(invoice.amountDueCents ?? 0) <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Cette facture est déjà soldée.', 400);
  }

  const daysOverdue = Number(invoice.daysOverdue);
  if (daysOverdue <= 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `L’échéance du ${invoice.dueDate} n’est pas encore passée : il n’y a rien à relancer.`,
      400
    );
  }

  const [last] = await db
    .select({ sentAt: invoiceReminders.sentAt })
    .from(invoiceReminders)
    .where(eq(invoiceReminders.invoiceId, invoiceId))
    .orderBy(desc(invoiceReminders.sentAt))
    .limit(1);

  if (last) {
    const hours = (now.getTime() - last.sentAt.getTime()) / 3_600_000;
    if (hours < MANUAL_REMINDER_COOLDOWN_HOURS) {
      throw new ApiError(
        'RATE_LIMITED',
        `Ce client a déjà été relancé il y a moins de ${MANUAL_REMINDER_COOLDOWN_HOURS} h. ` +
          'Laissez-lui le temps de réagir.',
        429
      );
    }
  }

  // Same escalation as the sweep: the rung actually reached, not the next one.
  const stage = [...REMINDER_STAGES].reverse().find((s) => daysOverdue >= s) ?? 0;

  const [reminder] = await db
    .insert(invoiceReminders)
    .values({
      organizationId,
      invoiceId,
      stage,
      daysOverdue,
      amountDueCents: BigInt(invoice.amountDueCents ?? 0n),
      kind: 'manual',
      sentByUserId: userId ?? null,
      sentAt: now,
    })
    .returning({ id: invoiceReminders.id, sentAt: invoiceReminders.sentAt });

  try {
    let markedOverdue = false;

    if (invoice.status !== 'overdue') {
      // `mark_overdue` emits `invoice.overdue` itself, so the transition *is* the
      // notice — emitting again below would send the client two emails at once.
      await transitionInvoice(organizationId, invoiceId, 'mark_overdue', userId ?? null, null);
      markedOverdue = true;
    } else {
      const [current] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      const payload = await buildEventPayload({
        organizationId,
        entityKind: 'invoice',
        entityId: invoiceId,
        entity: current ?? invoice,
        withPortalUrl: true,
        extra: { reminderStage: stage, daysOverdue, manual: true },
      });

      await emit('invoice.overdue', organizationId, payload);
    }

    return {
      reminderId: reminder.id,
      stage,
      daysOverdue,
      markedOverdue,
      sentAt: reminder.sentAt.toISOString(),
    };
  } catch (error) {
    // Nothing went out, so nothing should claim it did — and the cooldown must
    // not lock the button for a day over a failure the user can retry now.
    await db
      .delete(invoiceReminders)
      .where(eq(invoiceReminders.id, reminder.id))
      .catch((cleanupError) => {
        console.error(`Failed to release manual reminder for ${invoice.number}:`, cleanupError);
      });
    throw error;
  }
}

/** Reminder history of one invoice, most recent first. */
export async function listInvoiceReminders(organizationId: string, invoiceId: string) {
  const rows = await db
    .select({
      id: invoiceReminders.id,
      stage: invoiceReminders.stage,
      daysOverdue: invoiceReminders.daysOverdue,
      kind: invoiceReminders.kind,
      amountDueCents: invoiceReminders.amountDueCents,
      sentByUserId: invoiceReminders.sentByUserId,
      sentAt: invoiceReminders.sentAt,
    })
    .from(invoiceReminders)
    .where(
      and(
        eq(invoiceReminders.organizationId, organizationId),
        eq(invoiceReminders.invoiceId, invoiceId)
      )
    )
    .orderBy(desc(invoiceReminders.sentAt));

  return rows.map((row) => ({
    ...row,
    amountDueCents: row.amountDueCents.toString(),
    sentAt: row.sentAt.toISOString(),
  }));
}
