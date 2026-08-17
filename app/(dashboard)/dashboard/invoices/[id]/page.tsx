'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Ban, Download, Loader2, Send, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  BackLink,
  DetailFallback,
  InfoGrid,
  InfoRow,
  StatusPill,
  formatDate,
  formatDateTime,
  formatMoney,
} from '../../_components/detail-ui';

/**
 * Invoice detail (MVP3 §5).
 *
 * Lines, totals, payment history and the transitions the team owns. Recording a
 * manual payment lives here: most invoices in XOF are settled by transfer or
 * mobile money, and until now nothing in the UI could mark them as paid.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || fallback;

type Tone = 'blue' | 'green' | 'red' | 'amber' | 'gray';

interface InvoiceItem {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPriceCents: string;
  discountBps: number;
  amountCents: string;
}

interface Payment {
  id: string;
  amountCents: string;
  paidAt: string;
  method: string;
  source: string;
  reference?: string | null;
  notes?: string | null;
}

interface Invoice {
  id: string;
  projectId?: string | null;
  clientId: string;
  number: string;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  currency: string;
  subtotalCents: string;
  discountCents: string;
  taxRateBps: number;
  taxCents: string;
  totalCents: string;
  amountPaidCents: string;
  amountDueCents: string;
  issueDate: string;
  dueDate: string;
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
  items: InvoiceItem[];
  payments: Payment[];
}

const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  partial: { label: 'Partiellement payée', tone: 'amber' },
  paid: { label: 'Payée', tone: 'green' },
  overdue: { label: 'En retard', tone: 'red' },
  cancelled: { label: 'Annulée', tone: 'gray' },
  refunded: { label: 'Remboursée', tone: 'amber' },
};

const PAYMENT_METHOD: Record<string, string> = {
  bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  cash: 'Espèces',
  check: 'Chèque',
  other: 'Autre',
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: invoice, error, isLoading, mutate } = useSWR<Invoice>(`/api/v1/invoices/${id}`, fetcher);
  const { data: client } = useSWR<{ id: string; displayName: string; email: string }>(
    invoice?.clientId ? `/api/v1/clients/${invoice.clientId}` : null,
    fetcher
  );
  const { data: project } = useSWR<{ id: string; name: string }>(
    invoice?.projectId ? `/api/v1/projects/${invoice.projectId}` : null,
    fetcher
  );

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [payment, setPayment] = useState({
    amountCents: '',
    method: 'bank_transfer',
    paidAt: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
  });

  const handleTransition = async (action: 'send' | 'cancel' | 'refund' | 'mark_overdue') => {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Transition refusée'));

      const messages: Record<string, string> = {
        send: 'Facture envoyée au client',
        cancel: 'Facture annulée',
        refund: 'Facture marquée remboursée',
        mark_overdue: 'Facture marquée en retard',
      };
      toast.success(messages[action]);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Transition impossible');
    } finally {
      setPendingAction(null);
    }
  };

  const openPaymentDialog = () => {
    if (!invoice) return;
    // Pre-filling the remaining balance is what the user wants nine times out
    // of ten, and it is the amount that settles the invoice.
    setPayment({
      amountCents: invoice.amountDueCents || '',
      method: 'bank_transfer',
      paidAt: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    });
    setIsPaymentOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(payment.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Le montant doit être supérieur à zéro.');
      return;
    }

    setIsRecording(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: String(Math.trunc(amount)),
          method: payment.method,
          paidAt: payment.paidAt ? new Date(payment.paidAt).toISOString() : undefined,
          reference: payment.reference || null,
          notes: payment.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Paiement refusé'));

      toast.success(
        data?.invoice?.status === 'paid' ? 'Facture soldée' : 'Paiement partiel enregistré'
      );
      setIsPaymentOpen(false);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Enregistrement impossible');
    } finally {
      setIsRecording(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto">
        <DetailFallback>
          <Loader2 className="h-5 w-5 animate-spin text-[#0052ff]" />
        </DetailFallback>
      </section>
    );
  }

  if (error || !invoice?.id) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <BackLink href="/dashboard/invoices" label="Retour aux factures" />
        <DetailFallback>Cette facture est introuvable ou a été supprimée.</DetailFallback>
      </section>
    );
  }

  const status = INVOICE_STATUS[invoice.status] ?? { label: invoice.status, tone: 'gray' as const };
  const isOpenForPayment = ['sent', 'partial', 'overdue'].includes(invoice.status);
  const isOverdue =
    isOpenForPayment && invoice.status !== 'overdue' && new Date(invoice.dueDate) < new Date();

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-4 border-b border-gray-100 pb-6">
        <BackLink href="/dashboard/invoices" label="Retour aux factures" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight">
                Facture {invoice.number}
              </h1>
              <StatusPill label={status.label} tone={status.tone} />
            </div>
            <p className="text-[#5b616e] text-sm mt-1">
              {client?.displayName ? (
                <Link href={`/dashboard/clients/${invoice.clientId}`} className="text-[#0052ff] hover:underline">
                  {client.displayName}
                </Link>
              ) : (
                'Client'
              )}
              {project?.name && invoice.projectId && (
                <>
                  {' · '}
                  <Link href={`/dashboard/projects/${invoice.projectId}`} className="text-[#0052ff] hover:underline">
                    {project.name}
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {invoice.status === 'draft' && (
              <Button
                onClick={() => handleTransition('send')}
                disabled={pendingAction !== null}
                className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11 px-5"
              >
                {pendingAction === 'send' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Envoyer au client
              </Button>
            )}

            {isOpenForPayment && (
              <Button
                onClick={openPaymentDialog}
                className="rounded-full bg-[#05b169] hover:bg-[#049a5b] text-white text-xs font-semibold h-11 px-5"
              >
                <Wallet className="mr-2 h-4 w-4" /> Enregistrer un paiement
              </Button>
            )}

            {(invoice.status === 'paid' || invoice.status === 'partial') && (
              <Button
                variant="outline"
                onClick={() => handleTransition('refund')}
                disabled={pendingAction !== null}
                className="rounded-full text-xs font-semibold h-11 px-5 border-gray-200"
              >
                {pendingAction === 'refund' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" />
                )}
                Rembourser
              </Button>
            )}

            {['draft', 'sent', 'overdue'].includes(invoice.status) && (
              <Button
                variant="outline"
                onClick={() => handleTransition('cancel')}
                disabled={pendingAction !== null}
                className="rounded-full text-xs font-semibold h-11 px-5 border-gray-200 text-[#cf202f] hover:bg-[#cf202f]/10"
              >
                {pendingAction === 'cancel' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="mr-2 h-4 w-4" />
                )}
                Annuler
              </Button>
            )}

            <Button
              asChild
              variant="outline"
              className="rounded-full text-xs font-semibold h-11 px-5 border-gray-200"
            >
              <a href={`/api/v1/invoices/${invoice.id}/pdf/download`}>
                <Download className="mr-2 h-4 w-4" /> PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      {isOverdue && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#cf202f]/20 bg-[#cf202f]/5 p-4">
          <AlertTriangle className="h-4 w-4 text-[#cf202f] mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-xs text-[#0a0b0d]">
              L’échéance du {formatDate(invoice.dueDate)} est dépassée et il reste{' '}
              {formatMoney(invoice.amountDueCents, invoice.currency)} à encaisser.
            </p>
            <Button
              variant="outline"
              onClick={() => handleTransition('mark_overdue')}
              disabled={pendingAction !== null}
              className="rounded-full text-[11px] font-semibold h-9 px-4 border-[#cf202f]/30 text-[#cf202f] hover:bg-[#cf202f]/10"
            >
              {pendingAction === 'mark_overdue' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Marquer en retard et relancer
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Montant total</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">
              {formatMoney(invoice.totalCents, invoice.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Encaissé</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#05b169]">
              {formatMoney(invoice.amountPaidCents, invoice.currency)}
            </div>
            <p className="text-[11px] text-[#7c828a] mt-1">
              {invoice.payments?.length || 0} paiement(s) enregistré(s)
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Reste dû</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">
              {formatMoney(invoice.amountDueCents, invoice.currency)}
            </div>
            <p className="text-[11px] text-[#7c828a] mt-1">Échéance {formatDate(invoice.dueDate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-[#0a0b0d]">Informations</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <InfoGrid>
            <InfoRow label="Numéro">{invoice.number}</InfoRow>
            <InfoRow label="Émise le">{formatDate(invoice.issueDate)}</InfoRow>
            <InfoRow label="Échéance">{formatDate(invoice.dueDate)}</InfoRow>
            <InfoRow label="Devise">{invoice.currency}</InfoRow>
            <InfoRow label="Payée le">{formatDateTime(invoice.paidAt)}</InfoRow>
            <InfoRow label="Créée le">{formatDate(invoice.createdAt)}</InfoRow>
          </InfoGrid>

          {invoice.notes && (
            <div className="space-y-1 mt-5 pt-4 border-t border-gray-100">
              <div className="text-[11px] text-[#7c828a]">Notes</div>
              <p className="text-xs text-[#0a0b0d] whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100">
          <CardTitle className="text-sm font-medium text-[#0a0b0d]">Lignes de facturation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Description</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Qté</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Prix unitaire</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Remise</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.items || []).map((item) => (
                <TableRow key={item.id} className="border-gray-100">
                  <TableCell className="text-xs text-[#0a0b0d]">{item.description}</TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {Number(item.quantity).toLocaleString('fr-FR')} {item.unit || ''}
                  </TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {formatMoney(item.unitPriceCents, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {item.discountBps ? `${(item.discountBps / 100).toFixed(2)} %` : '—'}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-[#0a0b0d] text-right">
                    {formatMoney(item.amountCents, invoice.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="p-5 border-t border-gray-100 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-xs text-[#5b616e]">
              <span>Sous-total</span>
              <span>{formatMoney(invoice.subtotalCents, invoice.currency)}</span>
            </div>
            {Number(invoice.discountCents) > 0 && (
              <div className="flex justify-between text-xs text-[#5b616e]">
                <span>Remise</span>
                <span>-{formatMoney(invoice.discountCents, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-[#5b616e]">
              <span>TVA ({(invoice.taxRateBps / 100).toFixed(2)} %)</span>
              <span>{formatMoney(invoice.taxCents, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium text-[#0a0b0d] pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{formatMoney(invoice.totalCents, invoice.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100">
          <CardTitle className="text-sm font-medium text-[#0a0b0d] flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#7c828a]" /> Paiements
          </CardTitle>
          <CardDescription className="text-xs text-[#5b616e]">
            Encaissements manuels et paiements GeniusPay rapprochés.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!invoice.payments || invoice.payments.length === 0 ? (
            <div className="text-center py-10 text-[#7c828a] text-xs">Aucun paiement enregistré.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Moyen</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Source</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Référence</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((p) => (
                  <TableRow key={p.id} className="border-gray-100">
                    <TableCell className="text-xs text-[#5b616e]">{formatDateTime(p.paidAt)}</TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {PAYMENT_METHOD[p.method] || p.method}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {p.source === 'geniuspay' ? 'GeniusPay' : 'Manuel'}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">{p.reference || '—'}</TableCell>
                    <TableCell className="text-xs font-medium text-[#05b169] text-right">
                      {formatMoney(p.amountCents, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <form onSubmit={handleRecordPayment}>
            <DialogHeader>
              <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Enregistrer un paiement</DialogTitle>
              <DialogDescription className="text-xs text-[#5b616e]">
                Reste dû : {formatMoney(invoice.amountDueCents, invoice.currency)}. Solder la facture
                déclenche l’email de confirmation au client.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">
                  Montant reçu ({invoice.currency}) *
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={payment.amountCents}
                  onChange={(e) => setPayment({ ...payment, amountCents: e.target.value })}
                  className="rounded-xl text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Moyen de paiement</Label>
                  <Select
                    value={payment.method}
                    onValueChange={(val) => setPayment({ ...payment, method: val })}
                  >
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Date du paiement</Label>
                  <Input
                    type="date"
                    value={payment.paidAt}
                    onChange={(e) => setPayment({ ...payment, paidAt: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Référence</Label>
                <Input
                  placeholder="N° de transaction, bordereau…"
                  value={payment.reference}
                  onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Notes</Label>
                <Textarea
                  value={payment.notes}
                  onChange={(e) => setPayment({ ...payment, notes: e.target.value })}
                  className="rounded-xl text-xs"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={isRecording}
                className="w-full rounded-full bg-[#05b169] hover:bg-[#049a5b] text-white text-xs font-semibold h-11"
              >
                {isRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer le paiement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
