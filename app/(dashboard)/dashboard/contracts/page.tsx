'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, FileSignature, Loader2, Send, Download, Ban, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetcher,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
  type StatusTone,
} from '../_components/module-ui';

interface Contract {
  id: string;
  projectId: string;
  clientId: string;
  number: string;
  title: string;
  status: 'draft' | 'sent' | 'signed' | 'cancelled' | 'expired';
  sentAt: string | null;
  signedAt: string | null;
  signedByName: string | null;
  pdfFileId: string | null;
  signedPdfFileId: string | null;
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

const STATUS_LABELS: Record<Contract['status'], { label: string; tone: StatusTone }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  sent: { label: 'En attente de signature', tone: 'info' },
  signed: { label: 'Signé', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'warning' },
};

export default function ContractsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    clientId: '',
    projectId: '',
    title: '',
    bodyMarkdown: '',
  });

  const { data, isLoading, mutate } = useSWR<{ contracts: Contract[] }>(
    `/api/v1/contracts${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
    fetcher
  );
  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients', fetcher);
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);

  const contracts = data?.contracts || [];
  const clients = clientsData?.clients || [];
  const projects = projectsData?.projects || [];

  const filteredContracts = contracts.filter((c) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return c.number.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle);
  });

  const signedCount = contracts.filter((c) => c.status === 'signed').length;
  const awaitingCount = contracts.filter((c) => c.status === 'sent').length;

  const getClientName = (clientId: string) =>
    clients.find((c) => c.id === clientId)?.displayName || 'Client inconnu';

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.projectId || !formData.title) {
      toast.error('Le projet, le client et le titre sont requis');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Impossible de créer le contrat');
      }

      toast.success('Contrat créé en brouillon');
      setIsOpen(false);
      setFormData({ clientId: '', projectId: '', title: '', bodyMarkdown: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransition = async (id: string, action: 'send' | 'cancel') => {
    try {
      setPendingId(id);
      const res = await fetch(`/api/v1/contracts/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Transition refusée');
      }

      toast.success(action === 'send' ? 'Contrat envoyé au client' : 'Contrat annulé');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la transition');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Contrats"
        description="Rédigez, envoyez à la signature et suivez vos contrats clients."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
                <Plus className="mr-2 h-4 w-4" /> Nouveau contrat
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] rounded-2xl">
              <form onSubmit={handleCreateContract}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Créer un contrat</DialogTitle>
                  <DialogDescription className="text-xs text-[#5b616e]">
                    Le contrat est créé en brouillon. Il ne part au client qu&apos;une fois envoyé.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Projet *</Label>
                    <Select
                      value={formData.projectId}
                      onValueChange={(val) => setFormData({ ...formData, projectId: val })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Sélectionner le projet" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Client *</Label>
                    <Select
                      value={formData.clientId}
                      onValueChange={(val) => setFormData({ ...formData, clientId: val })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Sélectionner le client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Titre du contrat *</Label>
                    <Input
                      placeholder="Ex : Contrat de prestation — refonte du site"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Corps du contrat (Markdown)</Label>
                    <Textarea
                      placeholder={'## Objet\nLa présente convention a pour objet…'}
                      value={formData.bodyMarkdown}
                      onChange={(e) => setFormData({ ...formData, bodyMarkdown: e.target.value })}
                      className="rounded-xl min-h-32 text-xs"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer le brouillon'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <MetricCard
          label="Contrats signés"
          value={signedCount}
          hint="Signés via le portail client"
          icon={<CheckCircle2 className="h-4 w-4 text-[#05b169]" />}
        />
        <MetricCard
          label="En attente de signature"
          value={awaitingCount}
          hint="Envoyés, pas encore signés"
          icon={<Clock className="h-4 w-4 text-[#0052ff]" />}
        />
        <MetricCard
          label="Total contrats"
          value={contracts.length}
          hint="Toutes périodes confondues"
          icon={<FileSignature className="h-4 w-4 text-[#7c828a]" />}
        />
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher un numéro ou un titre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px] rounded-xl text-xs">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="sent">En attente de signature</SelectItem>
              <SelectItem value="signed">Signés</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
              <SelectItem value="expired">Expirés</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">Aucun contrat trouvé.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">N° / Titre</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Envoyé le</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Signé par</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Statut</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => {
                  const status = STATUS_LABELS[contract.status] || STATUS_LABELS.draft;
                  const isPending = pendingId === contract.id;

                  return (
                    <TableRow key={contract.id} className="border-gray-100 hover:bg-gray-50/50">
                      <TableCell className="text-xs text-[#0a0b0d]">
                        <div className="flex items-center gap-2 font-medium">
                          <FileSignature className="h-4 w-4 text-[#7c828a]" />
                          <span>{contract.number}</span>
                        </div>
                        <div className="text-[11px] text-[#7c828a] font-normal pl-6">{contract.title}</div>
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{getClientName(contract.clientId)}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{formatDate(contract.sentAt)}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {contract.signedByName || <span className="text-[#a8acb3]">—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {contract.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleTransition(contract.id, 'send')}
                              className="h-8 rounded-full text-[11px] text-[#0052ff] hover:bg-[#0052ff]/10"
                            >
                              {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Envoyer
                            </Button>
                          )}

                          {(contract.status === 'draft' || contract.status === 'sent') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleTransition(contract.id, 'cancel')}
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
                            <a
                              href={
                                contract.status === 'signed'
                                  ? `/api/v1/contracts/${contract.id}/signed-pdf/download`
                                  : `/api/v1/contracts/${contract.id}/pdf/download`
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </a>
                          </Button>
                        </div>
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
