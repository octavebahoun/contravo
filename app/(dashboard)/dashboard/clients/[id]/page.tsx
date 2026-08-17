'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Archive,
  ArchiveRestore,
  Building2,
  FileText,
  FolderKanban,
  Loader2,
  Pencil,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BackLink,
  DetailFallback,
  InfoGrid,
  InfoRow,
  StatusPill,
  formatDate,
  formatMoney,
} from '../../_components/detail-ui';

/**
 * Client detail (MVP3 §5).
 *
 * Everything the CRM knows about one client, plus the two collections the API
 * already exposes for it: its projects and its invoices. Both tables are
 * clickable so the whole chain client → projet → facture is navigable.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || fallback;

interface Client {
  id: string;
  type: 'individual' | 'company';
  displayName: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  vatNumber?: string | null;
  notes?: string | null;
  tags: string[];
  isArchived: boolean;
  createdAt: string;
}

interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  budgetCents?: string | null;
  currency: string;
  dueDate?: string | null;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  totalCents: string;
  amountDueCents: string;
  currency: string;
  issueDate: string;
  dueDate: string;
}

const PROJECT_STATUS: Record<string, { label: string; tone: 'blue' | 'green' | 'red' | 'amber' | 'gray' }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  active: { label: 'En cours', tone: 'blue' },
  on_hold: { label: 'En pause', tone: 'amber' },
  delivered: { label: 'Livré', tone: 'green' },
  cancelled: { label: 'Annulé', tone: 'red' },
  archived: { label: 'Archivé', tone: 'gray' },
};

const INVOICE_STATUS: Record<string, { label: string; tone: 'blue' | 'green' | 'red' | 'amber' | 'gray' }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  partial: { label: 'Partielle', tone: 'amber' },
  paid: { label: 'Payée', tone: 'green' },
  overdue: { label: 'En retard', tone: 'red' },
  cancelled: { label: 'Annulée', tone: 'gray' },
  refunded: { label: 'Remboursée', tone: 'amber' },
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: client, error, isLoading, mutate } = useSWR<Client>(`/api/v1/clients/${id}`, fetcher);
  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    `/api/v1/clients/${id}/projects`,
    fetcher
  );
  const { data: invoicesData } = useSWR<{ invoices: Invoice[] }>(
    `/api/v1/clients/${id}/invoices`,
    fetcher
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    companyName: '',
    email: '',
    phone: '',
    vatNumber: '',
    notes: '',
  });

  const projects = projectsData?.projects || [];
  const invoices = invoicesData?.invoices || [];

  const totalInvoiced = invoices
    .filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.totalCents || 0), 0);

  const totalDue = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'partial' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + Number(inv.amountDueCents || 0), 0);

  const openEdit = () => {
    if (!client) return;
    setForm({
      displayName: client.displayName,
      companyName: client.companyName || '',
      email: client.email,
      phone: client.phone || '',
      vatNumber: client.vatNumber || '',
      notes: client.notes || '',
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName,
          companyName: form.companyName || null,
          email: form.email,
          phone: form.phone || null,
          vatNumber: form.vatNumber || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Mise à jour refusée'));

      toast.success('Fiche client mise à jour');
      setIsEditing(false);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Mise à jour impossible');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!client) return;
    setIsArchiving(true);
    try {
      const action = client.isArchived ? 'unarchive' : 'archive';
      const res = await fetch(`/api/v1/clients/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Action refusée'));

      toast.success(client.isArchived ? 'Client réactivé' : 'Client archivé');
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Action impossible');
    } finally {
      setIsArchiving(false);
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

  if (error || !client?.id) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <BackLink href="/dashboard/clients" label="Retour aux clients" />
        <DetailFallback>Ce client est introuvable ou a été supprimé.</DetailFallback>
      </section>
    );
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-4 border-b border-gray-100 pb-6">
        <BackLink href="/dashboard/clients" label="Retour aux clients" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {client.type === 'company' ? (
                <Building2 className="h-5 w-5 text-[#0052ff]" />
              ) : (
                <User className="h-5 w-5 text-[#0052ff]" />
              )}
              <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight">
                {client.displayName}
              </h1>
              <StatusPill
                label={client.isArchived ? 'Archivé' : 'Actif'}
                tone={client.isArchived ? 'gray' : 'green'}
              />
            </div>
            <p className="text-[#5b616e] text-sm mt-1">
              {client.type === 'company' ? 'Entreprise' : 'Particulier'} · {client.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={openEdit}
              className="rounded-full text-xs font-semibold border-gray-200 h-11 px-5"
            >
              <Pencil className="mr-2 h-4 w-4" /> Modifier
            </Button>
            <Button
              variant="outline"
              onClick={handleArchiveToggle}
              disabled={isArchiving}
              className="rounded-full text-xs font-semibold border-gray-200 h-11 px-5"
            >
              {isArchiving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : client.isArchived ? (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              {client.isArchived ? 'Réactiver' : 'Archiver'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Total facturé</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{formatMoney(totalInvoiced)}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Hors brouillons et annulations</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Reste à encaisser</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{formatMoney(totalDue)}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Factures envoyées ou en retard</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Projets</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{projects.length}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Rattachés à ce client</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-[#0a0b0d]">Informations</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-5">
          <InfoGrid>
            <InfoRow label="Nom d’affichage">{client.displayName}</InfoRow>
            <InfoRow label="Raison sociale">{client.companyName || '—'}</InfoRow>
            <InfoRow label="Email">{client.email}</InfoRow>
            <InfoRow label="Téléphone">{client.phone || '—'}</InfoRow>
            <InfoRow label="N° de TVA">{client.vatNumber || '—'}</InfoRow>
            <InfoRow label="Créé le">{formatDate(client.createdAt)}</InfoRow>
          </InfoGrid>

          {client.notes && (
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <div className="text-[11px] text-[#7c828a] pt-3">Notes internes</div>
              <p className="text-xs text-[#0a0b0d] whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100">
          <CardTitle className="text-sm font-medium text-[#0a0b0d] flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-[#7c828a]" /> Projets
          </CardTitle>
          <CardDescription className="text-xs text-[#5b616e]">
            Cliquez une ligne pour ouvrir le projet.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="text-center py-10 text-[#7c828a] text-xs">Aucun projet pour ce client.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Code</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Budget</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Échéance</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const status = PROJECT_STATUS[project.status] ?? { label: project.status, tone: 'gray' as const };
                  return (
                    <TableRow
                      key={project.id}
                      onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                      className="border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                    >
                      <TableCell className="text-xs text-[#5b616e]">{project.code}</TableCell>
                      <TableCell className="text-xs font-medium text-[#0a0b0d]">{project.name}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {formatMoney(project.budgetCents, project.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{formatDate(project.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        <StatusPill label={status.label} tone={status.tone} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100">
          <CardTitle className="text-sm font-medium text-[#0a0b0d] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#7c828a]" /> Factures
          </CardTitle>
          <CardDescription className="text-xs text-[#5b616e]">
            Historique de facturation de ce client.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="text-center py-10 text-[#7c828a] text-xs">Aucune facture pour ce client.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">N°</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Émission</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Échéance</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Total</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Reste dû</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const status = INVOICE_STATUS[invoice.status] ?? { label: invoice.status, tone: 'gray' as const };
                  return (
                    <TableRow
                      key={invoice.id}
                      onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                      className="border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                    >
                      <TableCell className="text-xs font-medium text-[#0a0b0d]">{invoice.number}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{formatDate(invoice.issueDate)}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{formatDate(invoice.dueDate)}</TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {formatMoney(invoice.totalCents, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {formatMoney(invoice.amountDueCents, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusPill label={status.label} tone={status.tone} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Modifier le client</DialogTitle>
              <DialogDescription className="text-xs text-[#5b616e]">
                Les modifications sont journalisées dans l’audit.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Nom d’affichage *</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Raison sociale</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Téléphone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">N° de TVA</Label>
                  <Input
                    value={form.vatNumber}
                    onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-[#0a0b0d]">Notes internes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-xl text-xs"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
