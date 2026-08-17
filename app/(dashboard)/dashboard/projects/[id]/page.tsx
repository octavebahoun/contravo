'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  PauseCircle,
  PlayCircle,
  Receipt,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { Stamp, type StampTone } from '@/components/stamp';
import {
  BackLink,
  DetailFallback,
  InfoGrid,
  InfoRow,
  formatDate,
  formatDateTime,
  formatMoney,
} from '../../_components/detail-ui';

/**
 * Project detail (MVP3 §5).
 *
 * Gathers what was previously only reachable through the API: the state
 * machine (`/transition`), profitability, deliverables, expenses, and the
 * quotes and invoices attached to the project. It is also the only place that
 * calls `POST /projects/:id/review-request` — the endpoint existed with no
 * button anywhere.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || fallback;


interface Project {
  id: string;
  clientId: string;
  code: string;
  name: string;
  description?: string | null;
  status: 'draft' | 'active' | 'on_hold' | 'delivered' | 'cancelled' | 'archived';
  startDate?: string | null;
  dueDate?: string | null;
  deliveredAt?: string | null;
  budgetCents?: string | null;
  currency: string;
  createdAt: string;
}

interface Profitability {
  currency: string;
  revenue: string;
  collected: string;
  expenses: string;
  grossMargin: string;
  marginPctBps: number;
  cashPosition: string;
}

interface Deliverable {
  id: string;
  title: string;
  status: string;
  version: number;
  fileName?: string | null;
  submittedAt?: string | null;
  createdAt: string;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amountCents: string;
  currency: string;
  incurredOn: string;
  vendor?: string | null;
}

interface Quote {
  id: string;
  number: string;
  status: string;
  totalCents: string;
  currency: string;
  validUntil?: string | null;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  totalCents: string;
  amountDueCents: string;
  currency: string;
  dueDate: string;
}

const PROJECT_STATUS: Record<string, { label: string; tone: StampTone }> = {
  draft: { label: 'Brouillon', tone: 'ink' },
  active: { label: 'En cours', tone: 'warning' },
  on_hold: { label: 'En pause', tone: 'warning' },
  delivered: { label: 'Livré', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'destructive' },
  archived: { label: 'Archivé', tone: 'ink' },
};

const DELIVERABLE_STATUS: Record<string, { label: string; tone: StampTone }> = {
  draft: { label: 'Brouillon', tone: 'ink' },
  submitted: { label: 'Soumis', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'destructive' },
  revision_requested: { label: 'Révision demandée', tone: 'warning' },
};

const QUOTE_STATUS: Record<string, { label: string; tone: StampTone }> = {
  draft: { label: 'Brouillon', tone: 'ink' },
  sent: { label: 'Envoyé', tone: 'warning' },
  viewed: { label: 'Vu', tone: 'warning' },
  accepted: { label: 'Accepté', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'destructive' },
  expired: { label: 'Expiré', tone: 'warning' },
  cancelled: { label: 'Annulé', tone: 'ink' },
};

const INVOICE_STATUS: Record<string, { label: string; tone: StampTone }> = {
  draft: { label: 'Brouillon', tone: 'ink' },
  sent: { label: 'Envoyée', tone: 'warning' },
  partial: { label: 'Partielle', tone: 'warning' },
  paid: { label: 'Payée', tone: 'success' },
  overdue: { label: 'En retard', tone: 'destructive' },
  cancelled: { label: 'Annulée', tone: 'ink' },
  refunded: { label: 'Remboursée', tone: 'warning' },
};

const EXPENSE_CATEGORY: Record<string, string> = {
  salary: 'Salaire',
  subcontractor: 'Sous-traitance',
  software: 'Logiciel',
  hardware: 'Matériel',
  travel: 'Déplacement',
  marketing: 'Marketing',
  other: 'Autre',
};

/**
 * Transitions offered for the current status.
 *
 * Mirrors the server-side map in `/api/v1/projects/:id/transition`; anything
 * not listed there would be refused with a 400, so offering it would be a dead
 * button.
 */
const NEXT_STATES: Record<string, { to: string; label: string; icon: typeof PlayCircle; danger?: boolean }[]> = {
  draft: [{ to: 'active', label: 'Activer', icon: PlayCircle }],
  active: [
    { to: 'delivered', label: 'Marquer livré', icon: CheckCircle2 },
    { to: 'on_hold', label: 'Mettre en pause', icon: PauseCircle },
    { to: 'cancelled', label: 'Annuler', icon: Ban, danger: true },
  ],
  on_hold: [{ to: 'active', label: 'Reprendre', icon: PlayCircle }],
  delivered: [{ to: 'archived', label: 'Archiver', icon: Package }],
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: project, error, isLoading, mutate } = useSWR<Project>(`/api/v1/projects/${id}`, fetcher);
  const { data: profitData } = useSWR<{ profitability: Profitability[] }>(
    `/api/v1/projects/${id}/profitability`,
    fetcher
  );
  const { data: deliverablesData } = useSWR<{ deliverables: Deliverable[] }>(
    `/api/v1/projects/${id}/deliverables`,
    fetcher
  );
  const { data: expensesData } = useSWR<{ expenses: Expense[] }>(
    `/api/v1/projects/${id}/expenses`,
    fetcher
  );
  const { data: quotesData } = useSWR<{ quotes: Quote[] }>(`/api/v1/quotes?projectId=${id}`, fetcher);
  const { data: invoicesData } = useSWR<{ invoices: Invoice[] }>(
    `/api/v1/invoices?projectId=${id}`,
    fetcher
  );
  const { data: clientData } = useSWR<{ id: string; displayName: string; email: string }>(
    project?.clientId ? `/api/v1/clients/${project.clientId}` : null,
    fetcher
  );

  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [isRequestingReview, setIsRequestingReview] = useState(false);
  const [confirmReview, setConfirmReview] = useState(false);

  const deliverables = deliverablesData?.deliverables || [];
  const expenses = expensesData?.expenses || [];
  const quotes = quotesData?.quotes || [];
  const invoices = invoicesData?.invoices || [];

  // The service returns one row per currency involved; the project's own
  // currency is the one that matters for the header figures.
  const profit =
    profitData?.profitability?.find((p) => p.currency === project?.currency) ??
    profitData?.profitability?.[0] ??
    null;

  const handleTransition = async (to: string) => {
    setPendingTo(to);
    try {
      const res = await fetch(`/api/v1/projects/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Transition refusée'));

      toast.success('Statut du projet mis à jour');
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Transition impossible');
    } finally {
      setPendingTo(null);
    }
  };

  /**
   * Emits `review.requested`, which n8n turns into the client email carrying
   * the portal link. The recipient is the project's client — the endpoint takes
   * a `clientId` but there is only ever one valid value here.
   */
  const handleReviewRequest = async () => {
    if (!project) return;
    setIsRequestingReview(true);
    try {
      const res = await fetch(`/api/v1/projects/${id}/review-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: project.clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Demande refusée'));

      toast.success('Demande d’avis envoyée au client');
      setConfirmReview(false);
    } catch (err: any) {
      toast.error(err.message || 'Demande impossible');
    } finally {
      setIsRequestingReview(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto">
        <DetailFallback>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </DetailFallback>
      </section>
    );
  }

  if (error || !project?.id) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <BackLink href="/dashboard/projects" label="Retour aux projets" />
        <DetailFallback>Ce projet est introuvable ou a été supprimé.</DetailFallback>
      </section>
    );
  }

  const status = PROJECT_STATUS[project.status] ?? { label: project.status, tone: 'ink' as const };
  const transitions = NEXT_STATES[project.status] ?? [];

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-4 border-b border-border pb-6">
        <BackLink href="/dashboard/projects" label="Retour aux projets" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-normal text-foreground tracking-tight">
                {project.name}
              </h1>
              <Stamp label={status.label} tone={status.tone} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {project.code}
              {clientData?.displayName && (
                <>
                  {' · '}
                  <Link
                    href={`/dashboard/clients/${project.clientId}`}
                    className="text-primary hover:underline"
                  >
                    {clientData.displayName}
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {transitions.map(({ to, label, icon: Icon, danger }) => (
              <Button
                key={to}
                variant="outline"
                onClick={() => handleTransition(to)}
                disabled={pendingTo !== null}
                className={`rounded-full text-xs font-semibold h-11 px-5 border-border ${
                  danger ? 'text-destructive hover:bg-destructive/10' : ''
                }`}
              >
                {pendingTo === to ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="mr-2 h-4 w-4" />
                )}
                {label}
              </Button>
            ))}

            {(project.status === 'delivered' || project.status === 'active') && (
              <Button
                onClick={() => setConfirmReview(true)}
                className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11 px-5"
              >
                <Star className="mr-2 h-4 w-4" /> Demander un avis
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Budget</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="tabular-mono text-xl font-medium text-foreground">
              {formatMoney(project.budgetCents, project.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Facturé</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="tabular-mono text-xl font-medium text-foreground">
              {formatMoney(profit?.revenue, project.currency)}
            </div>
            <p className="tabular-mono text-[11px] text-muted-foreground mt-1">
              Encaissé : {formatMoney(profit?.collected, project.currency)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Dépenses</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="tabular-mono text-xl font-medium text-foreground">
              {formatMoney(profit?.expenses, project.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Marge brute</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="tabular-mono text-xl font-medium text-foreground">
              {formatMoney(profit?.grossMargin, project.currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {profit ? `${(profit.marginPctBps / 100).toFixed(1)} %` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-foreground">Informations</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-5">
          <InfoGrid>
            <InfoRow label="Code">{project.code}</InfoRow>
            <InfoRow label="Client">{clientData?.displayName || '—'}</InfoRow>
            <InfoRow label="Devise">{project.currency}</InfoRow>
            <InfoRow label="Début">{formatDate(project.startDate)}</InfoRow>
            <InfoRow label="Échéance">{formatDate(project.dueDate)}</InfoRow>
            <InfoRow label="Livré le">{formatDateTime(project.deliveredAt)}</InfoRow>
          </InfoGrid>

          {project.description && (
            <div className="space-y-1 pt-2 border-t border-border">
              <div className="text-[11px] text-muted-foreground pt-3">Description</div>
              <p className="text-xs text-foreground whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> Livrables
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deliverables.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs">Aucun livrable.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Titre</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Version</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Fichier</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Soumis le</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliverables.map((deliverable) => {
                  const dStatus =
                    DELIVERABLE_STATUS[deliverable.status] ?? { label: deliverable.status, tone: 'ink' as const };
                  return (
                    <TableRow key={deliverable.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-xs font-medium text-foreground">{deliverable.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">v{deliverable.version}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{deliverable.fileName || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(deliverable.submittedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Stamp label={dStatus.label} tone={dStatus.tone} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 border-b border-border">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Devis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {quotes.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">Aucun devis.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold text-foreground">N°</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground">Total</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => {
                    const qStatus = QUOTE_STATUS[quote.status] ?? { label: quote.status, tone: 'ink' as const };
                    return (
                      <TableRow
                        key={quote.id}
                        onClick={() => router.push(`/dashboard/quotes/${quote.id}`)}
                        className="border-border hover:bg-muted/50 cursor-pointer"
                      >
                        <TableCell className="text-xs font-medium text-foreground">{quote.number}</TableCell>
                        <TableCell className="tabular-mono text-xs text-muted-foreground">
                          {formatMoney(quote.totalCents, quote.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Stamp label={qStatus.label} tone={qStatus.tone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 border-b border-border">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Factures
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">Aucune facture.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold text-foreground">N°</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground">Total</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const iStatus =
                      INVOICE_STATUS[invoice.status] ?? { label: invoice.status, tone: 'ink' as const };
                    return (
                      <TableRow
                        key={invoice.id}
                        onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                        className="border-border hover:bg-muted/50 cursor-pointer"
                      >
                        <TableCell className="text-xs font-medium text-foreground">{invoice.number}</TableCell>
                        <TableCell className="tabular-mono text-xs text-muted-foreground">
                          {formatMoney(invoice.totalCents, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Stamp label={iStatus.label} tone={iStatus.tone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" /> Dépenses
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Déduites de la marge brute affichée plus haut.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs">Aucune dépense enregistrée.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Catégorie</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Description</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Fournisseur</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id} className="border-border hover:bg-muted/50">
                    <TableCell className="text-xs text-muted-foreground">{formatDate(expense.incurredOn)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {EXPENSE_CATEGORY[expense.category] || expense.category}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">{expense.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{expense.vendor || '—'}</TableCell>
                    <TableCell className="tabular-mono text-xs font-medium text-foreground text-right">
                      {formatMoney(expense.amountCents, expense.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmReview} onOpenChange={setConfirmReview}>
        <DialogContent className="sm:max-w-[425px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal text-foreground">Demander un avis</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {clientData?.email
                ? `Un email sera envoyé à ${clientData.email} avec un lien sécurisé pour déposer son avis sur ce projet.`
                : 'Un email sera envoyé au client avec un lien sécurisé pour déposer son avis sur ce projet.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmReview(false)}
              className="rounded-lg text-xs font-semibold border-border h-11"
            >
              Annuler
            </Button>
            <Button
              onClick={handleReviewRequest}
              disabled={isRequestingReview}
              className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
            >
              {isRequestingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer la demande'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
