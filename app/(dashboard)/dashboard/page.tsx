'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Wallet,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  fetcher,
  formatAmount,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
  type StatusTone,
} from './_components/module-ui';

/**
 * Authenticated home screen.
 *
 * Replaces the SaaS starter's "Team Settings" page, which still shipped here in
 * English and read from the legacy `/api/team` route. Team management moved to
 * `/dashboard/team` unchanged; this page reads the v1 API like every other
 * business screen.
 */

interface Invoice {
  id: string;
  /** The API serializes the column as `number`; `invoiceNumber` never existed. */
  number: string;
  clientId: string;
  totalCents: string;
  amountDueCents: string;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  dueDate: string;
}

interface Quote {
  id: string;
  /** Same as invoices: the column is `number`. */
  number: string;
  clientId: string;
  totalCents: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  validUntil: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Client {
  id: string;
  displayName: string;
}

const QUOTE_TONES: Record<string, { label: string; tone: StatusTone }> = {
  accepted: { label: 'Accepté', tone: 'success' },
  sent: { label: 'Envoyé', tone: 'info' },
  viewed: { label: 'Vu', tone: 'info' },
  rejected: { label: 'Refusé', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'warning' },
};

export default function DashboardPage() {
  const { data: invoicesData, isLoading: loadingInvoices } = useSWR<{ invoices: Invoice[] }>(
    '/api/v1/invoices?limit=100',
    fetcher
  );
  const { data: quotesData } = useSWR<{ quotes: Quote[] }>('/api/v1/quotes?limit=100', fetcher);
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects?limit=100', fetcher);
  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients?limit=100', fetcher);

  const invoices = invoicesData?.invoices || [];
  const quotes = quotesData?.quotes || [];
  const projects = projectsData?.projects || [];
  const clients = clientsData?.clients || [];

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.displayName || 'Client inconnu';

  const sum = (rows: { totalCents?: string; amountDueCents?: string }[], key: 'totalCents' | 'amountDueCents') =>
    rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

  const paid = sum(invoices.filter((i) => i.status === 'paid'), 'totalCents');
  const outstanding = sum(
    invoices.filter((i) => i.status === 'sent' || i.status === 'partial' || i.status === 'overdue'),
    'amountDueCents'
  );

  const overdue = invoices.filter((i) => i.status === 'overdue');
  const awaitingQuotes = quotes.filter((q) => q.status === 'sent' || q.status === 'viewed');
  const activeProjects = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled');

  const recentQuotes = [...quotes]
    .filter((q) => q.status !== 'draft')
    .slice(0, 5);

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Vue d'ensemble"
        description="L'état de votre activité : encaissements, devis en attente et projets en cours."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Encaissé"
          value={formatAmount(paid)}
          hint="Factures payées"
          icon={<Wallet className="h-4 w-4 text-accent" />}
        />
        <MetricCard
          label="En attente de paiement"
          value={formatAmount(outstanding)}
          hint={`${overdue.length} facture(s) en retard`}
          icon={<Clock className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Devis en attente"
          value={awaitingQuotes.length}
          hint="Envoyés, sans réponse"
          icon={<FileSpreadsheet className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Projets actifs"
          value={activeProjects.length}
          hint={`${clients.length} client(s) au total`}
          icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {overdue.length > 0 && (
        <Card className="rounded-xl border border-destructive/20 bg-destructive/5">
          <CardHeader className="p-5 pb-2 flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm font-medium text-foreground">
              {overdue.length} facture(s) en retard de paiement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="tabular-mono text-xs text-muted-foreground mb-3">
              Total dû : {formatAmount(sum(overdue, 'amountDueCents'))}
            </p>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-[11px] text-destructive hover:bg-destructive/10 px-0"
            >
              <Link href="/dashboard/invoices">
                Voir les factures <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground">Derniers devis envoyés</CardTitle>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 rounded-full text-[11px] text-primary hover:bg-primary/10"
          >
            <Link href="/dashboard/quotes">
              Tout voir <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {loadingInvoices ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : recentQuotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Aucun devis envoyé pour l’instant.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">N° Devis</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Valide jusqu’au</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Montant</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentQuotes.map((quote) => {
                  const badge = QUOTE_TONES[quote.status] || { label: 'Brouillon', tone: 'neutral' as StatusTone };
                  return (
                    <TableRow key={quote.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-xs font-medium text-foreground">{quote.number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{clientName(quote.clientId)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(quote.validUntil)}</TableCell>
                      <TableCell className="tabular-mono text-xs font-medium text-foreground">
                        {formatAmount(quote.totalCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
