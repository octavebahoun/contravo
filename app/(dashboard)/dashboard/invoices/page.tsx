'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, FileText, CheckCircle2, Clock, AlertTriangle, Loader2, Download, Trash2, Send, Ban } from 'lucide-react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  totalCents: string | number;
  amountDueCents: string | number;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  issueDate: string;
  dueDate: string;
  createdAt: string;
}

interface Client {
  id: string;
  displayName: string;
}

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    notes: '',
  });

  const [items, setItems] = useState([
    { description: 'Prestation de service', quantity: '1', unitPriceCents: '150000' },
  ]);

  const { data: invoicesData, isLoading, mutate } = useSWR<{ invoices: Invoice[] }>(
    `/api/v1/invoices${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
    fetcher
  );

  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients', fetcher);

  const invoices = invoicesData?.invoices || [];
  const clients = clientsData?.clients || [];

  const filteredInvoices = invoices.filter(
    (inv) =>
      (inv.invoiceNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (inv.clientId || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPaidCents = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (typeof inv.totalCents === 'string' ? parseInt(inv.totalCents, 10) : inv.totalCents), 0);

  const totalPendingCents = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + (typeof inv.amountDueCents === 'string' ? parseInt(inv.amountDueCents, 10) : inv.amountDueCents), 0);

  const getClientName = (clientId: string) => {
    const found = clients.find((c) => c.id === clientId);
    return found ? found.displayName : 'Client inconnu';
  };

  const formatAmount = (cents: string | number) => {
    const val = typeof cents === 'string' ? parseInt(cents, 10) : cents;
    return `${val.toLocaleString()} XOF`;
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: '1', unitPriceCents: '0' }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || items.some((it) => !it.description)) {
      toast.error('Veuillez remplir le client et toutes les lignes d’articles');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: formData.clientId,
          dueDate: formData.dueDate,
          notes: formData.notes,
          status: 'sent',
          items: items.map((it, idx) => ({
            description: it.description,
            quantity: it.quantity,
            unitPriceCents: parseInt(it.unitPriceCents, 10) || 0,
            position: idx,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Erreur lors de la création de la facture');
      }

      toast.success('Facture générée avec succès');
      setIsOpen(false);
      setFormData({ clientId: '', dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], notes: '' });
      setItems([{ description: 'Prestation de service', quantity: '1', unitPriceCents: '150000' }]);
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur création facture');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Drives the invoice state machine (MVP3 §5).
   *
   * `send` mints the client's portal token and emits `invoice.sent`, which n8n
   * turns into the email carrying the payment link.
   */
  const handleTransition = async (id: string, action: 'send' | 'cancel') => {
    try {
      setPendingId(id);
      const res = await fetch(`/api/v1/invoices/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Transition refusée');
      }

      toast.success(action === 'send' ? 'Facture envoyée au client' : 'Facture annulée');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la transition');
    } finally {
      setPendingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20 rounded-full text-[10px] font-medium shadow-none">
            Payée
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full text-[10px] font-medium shadow-none">
            Envoyée
          </Badge>
        );
      case 'overdue':
        return (
          <Badge className="bg-[#cf202f]/10 text-[#cf202f] border-[#cf202f]/20 rounded-full text-[10px] font-medium shadow-none">
            En retard
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="rounded-full text-[10px] text-gray-500 border-gray-200">
            Brouillon
          </Badge>
        );
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
            Factures Client
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Générez des factures professionnelles, suivez les encaissements et gérez les relances.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Créer une Facture
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px] rounded-2xl">
            <form onSubmit={handleCreateInvoice}>
              <DialogHeader>
                <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Créer une nouvelle facture</DialogTitle>
                <DialogDescription className="text-xs text-[#5b616e]">
                  Renseignez les détails du client et les lignes de facturation.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Client *</Label>
                    <Select
                      value={formData.clientId}
                      onValueChange={(val) => setFormData({ ...formData, clientId: val })}
                    >
                      <SelectTrigger className="rounded-xl text-xs">
                        <SelectValue placeholder="Choisir un client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Date d'échéance</Label>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="rounded-xl text-xs"
                    />
                  </div>
                </div>

                {/* Articles Lignes */}
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Prestations & Articles</Label>
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Description..."
                        value={item.description}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].description = e.target.value;
                          setItems(newItems);
                        }}
                        className="rounded-xl text-xs flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Qté"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].quantity = e.target.value;
                          setItems(newItems);
                        }}
                        className="rounded-xl text-xs w-20"
                      />
                      <Input
                        type="number"
                        placeholder="Prix unit. (XOF)"
                        value={item.unitPriceCents}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].unitPriceCents = e.target.value;
                          setItems(newItems);
                        }}
                        className="rounded-xl text-xs w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                        className="h-9 w-9 text-red-500 hover:text-red-600 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddItem}
                    className="rounded-full text-xs font-medium border-gray-200 mt-1"
                  >
                    + Ajouter une ligne
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Générer et envoyer la facture'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Total Encaissé</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{formatAmount(totalPaidCents)}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Factures marquées réglées</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">En Attente de Paiement</CardTitle>
            <Clock className="h-4 w-4 text-[#0052ff]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{formatAmount(totalPendingCents)}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Factures envoyées & en cours</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Nombre de Factures</CardTitle>
            <FileText className="h-4 w-4 text-[#7c828a]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{invoices.length}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Émises au total</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Shadcn Factures */}
      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher N° de facture..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-xl text-xs">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="paid">Payées</SelectItem>
              <SelectItem value="sent">Envoyées</SelectItem>
              <SelectItem value="overdue">En retard</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">
              Aucune facture enregistrée.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">N° Facture</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Émission</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Échéance</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Montant Total</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Statut</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="font-medium text-xs text-[#0a0b0d] flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#7c828a]" />
                      <span>{inv.invoiceNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {getClientName(inv.clientId)}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">{inv.issueDate}</TableCell>
                    <TableCell className="text-xs text-[#5b616e]">{inv.dueDate}</TableCell>
                    <TableCell className="text-xs font-medium text-[#0a0b0d]">
                      {formatAmount(inv.totalCents)}
                    </TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pendingId === inv.id}
                            onClick={() => handleTransition(inv.id, 'send')}
                            className="h-8 rounded-full text-[11px] text-[#0052ff] hover:bg-[#0052ff]/10"
                          >
                            {pendingId === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Envoyer
                          </Button>
                        )}

                        {(inv.status === 'draft' || inv.status === 'sent' || inv.status === 'overdue') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pendingId === inv.id}
                            onClick={() => handleTransition(inv.id, 'cancel')}
                            className="h-8 rounded-full text-[11px] text-[#cf202f] hover:bg-[#cf202f]/10"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Annuler
                          </Button>
                        )}

                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full text-[11px] text-[#5b616e] hover:bg-gray-100"
                        >
                          <a href={`/api/v1/invoices/${inv.id}/pdf/download`}>
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
