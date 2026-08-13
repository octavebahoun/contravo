import { db } from '@/lib/db/drizzle';
import { invoices, invoicePayments, expenses } from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { getProjectById } from '@/lib/repositories/projects.repo';

export interface ProfitabilityMetrics {
  currency: string;
  revenue: string;
  collected: string;
  expenses: string;
  grossMargin: string;
  marginPctBps: number;
  cashPosition: string;
}

export async function calculateProjectProfitability(
  organizationId: string,
  projectId: string
): Promise<ProfitabilityMetrics[]> {
  const project = await getProjectById(organizationId, projectId);
  if (!project) {
    throw new ApiError('NOT_FOUND', 'Project not found', 404);
  }

  // 1. Fetch project invoices (excluding draft, cancelled, refunded)
  const projectInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.projectId, projectId),
        sql`deleted_at IS NULL`,
        inArray(invoices.status, ['sent', 'partial', 'paid', 'overdue'])
      )
    );

  const invoiceIds = projectInvoices.map((inv) => inv.id);

  // 2. Fetch invoice payments
  let payments: typeof invoicePayments.$inferSelect[] = [];
  if (invoiceIds.length > 0) {
    payments = await db
      .select()
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, organizationId),
          inArray(invoicePayments.invoiceId, invoiceIds)
        )
      );
  }

  // 3. Fetch project expenses
  const projectExpenses = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.projectId, projectId),
        sql`deleted_at IS NULL`
      )
    );

  // 4. Gather all currencies
  const currencies = new Set<string>();
  currencies.add(project.currency || 'XOF');
  for (const inv of projectInvoices) {
    currencies.add(inv.currency);
  }
  for (const exp of projectExpenses) {
    currencies.add(exp.currency);
  }

  // 5. Calculate metrics per currency
  const metricsList = Array.from(currencies).map((curr) => {
    const revenue = projectInvoices
      .filter((inv) => inv.currency === curr)
      .reduce((sum, inv) => sum + BigInt(inv.totalCents), 0n);

    const collected = payments
      .filter((pay) => {
        const inv = projectInvoices.find((i) => i.id === pay.invoiceId);
        return inv && inv.currency === curr;
      })
      .reduce((sum, pay) => sum + BigInt(pay.amountCents), 0n);

    const expSum = projectExpenses
      .filter((exp) => exp.currency === curr)
      .reduce((sum, exp) => sum + BigInt(exp.amountCents), 0n);

    const grossMargin = revenue - expSum;
    const cashPosition = collected - expSum;

    let marginPctBps = 0;
    if (revenue > 0n) {
      marginPctBps = Number((grossMargin * 10000n) / revenue);
    }

    return {
      currency: curr,
      revenue: revenue.toString(),
      collected: collected.toString(),
      expenses: expSum.toString(),
      grossMargin: grossMargin.toString(),
      marginPctBps,
      cashPosition: cashPosition.toString(),
    };
  });

  return metricsList;
}
