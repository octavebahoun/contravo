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
import { Plus, Search, FileSpreadsheet, CheckCircle2, Clock, XCircle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  projectId: string;
  totalCents: string | number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  validUntil: string;
  createdAt: string;
}

interface Client {
  id: string;
  displayName: string;
}

interface Project {
  id: string;
  name: string;
}

export default function QuotesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    projectId: '',
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: '',
  });

  const [items, setItems] = useState([
    { description: 'Proposition de développement', quantity: '1', unitPriceCents: '300000' },
  ]);

  const { data: quotesData, isLoading, mutate } = useSWR<{ quotes: Quote[] }>(
    `/api/v1/quotes${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
    fetcher
  );

  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients', fetcher);
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);

  const quotes = quotesData?.quotes || [];
  const clients = clientsData?.clients || [];
  const projects = projectsData?.projects || [];

  const filteredQuotes = quotes.filter(
    (q) =>
      (q.quoteNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (q.clientId || '').toLowerCase().includes(search.toLowerCase())
  );

  const acceptedCount = quotes.filter((q) => q.status === 'accepted').length;
  const pendingCount = quotes.filter((q) => q.status === 'sent' || q.status === 'viewed').length;

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

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.projectId || items.some((it) => !it.description)) {
      toast.error('Veuillez renseigner le client, le projet et les lignes de devis');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: formData.clientId,
          projectId: formData.projectId,
          validUntil: formData.validUntil,
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
        throw new Error(errData.message || 'Erreur lors de la création du devis');
      }

      toast.success('Devis créé et envoyé avec succès');
      setIsOpen(false);
      setFormData({
        clientId: '',
        projectId: '',
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: '',
      });
      setItems([{ description: 'Proposition de développement', quantity: '1', unitPriceCents: '300000' }]);
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur création devis');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <Badge className="bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20 rounded-full text-[10px] font-medium shadow-none">
            Accepté
          </Badge>
        );
      case 'sent':
      case 'viewed':
        return (
          <Badge className="bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full text-[10px] font-medium shadow-none">
            Envoyé / Vu
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-[#cf202f]/10 text-[#cf202f] border-[#cf202f]/20 rounded-full text-[10px] font-medium shadow-none">
            Refusé
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
      {/* Header Style Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
            Devis & Propositions
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Établissez des devis estimatifs et faites-les signer en ligne par vos clients.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Créer un Devis
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px] rounded-2xl">
            <form onSubmit={handleCreateQuote}>
              <DialogHeader>
                <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Créer une proposition de devis</DialogTitle>
                <DialogDescription className="text-xs text-[#5b616e]">
                  Définissez la durée de validité et le détail des prestations.
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
                    <Label className="text-xs font-medium text-[#0a0b0d]">Projet rattaché *</Label>
                    <Select
                      value={formData.projectId}
                      onValueChange={(val) => setFormData({ ...formData, projectId: val })}
                    >
                      <SelectTrigger className="rounded-xl text-xs">
                        <SelectValue placeholder="Choisir un projet" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Valide jusqu'au</Label>
                  <Input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>

                {/* Articles Lignes */}
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Lignes du Devis</Label>
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Description prestation..."
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
                        className="h-9 w-9 text-red-500 shrink-0"
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
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer et envoyer la proposition'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Devis Acceptés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{acceptedCount}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Signés par les clients</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">En Attente de Réponse</CardTitle>
            <Clock className="h-4 w-4 text-[#0052ff]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{pendingCount}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Envoyés ou consultés</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Total Devis Émis</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-[#7c828a]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{quotes.length}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Propositions créées</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Shadcn Devis */}
      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher N° de devis..."
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
              <SelectItem value="accepted">Acceptés</SelectItem>
              <SelectItem value="sent">Envoyés</SelectItem>
              <SelectItem value="rejected">Refusés</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">
              Aucun devis trouvé.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">N° Devis</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Valide Jusqu'au</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Montant Total</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((q) => (
                  <TableRow key={q.id} className="border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="font-medium text-xs text-[#0a0b0d] flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-[#7c828a]" />
                      <span>{q.quoteNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {getClientName(q.clientId)}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">{q.validUntil}</TableCell>
                    <TableCell className="text-xs font-medium text-[#0a0b0d]">
                      {formatAmount(q.totalCents)}
                    </TableCell>
                    <TableCell className="text-right">{getStatusBadge(q.status)}</TableCell>
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
