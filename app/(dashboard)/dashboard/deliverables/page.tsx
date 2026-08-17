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
import { Plus, Search, Package, Loader2, Send, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetcher,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
  type StatusTone,
} from '../_components/module-ui';

interface Deliverable {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  fileName: string | null;
  version: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<Deliverable['status'], { label: string; tone: StatusTone }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  submitted: { label: 'Soumis au client', tone: 'info' },
  approved: { label: 'Approuvé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  revision_requested: { label: 'Révision demandée', tone: 'warning' },
};

export default function DeliverablesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    projectId: '',
    title: '',
    description: '',
  });

  const { data, isLoading, mutate } = useSWR<{ deliverables: Deliverable[] }>(
    `/api/v1/deliverables${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
    fetcher
  );
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);

  const deliverables = data?.deliverables || [];
  const projects = projectsData?.projects || [];

  const filteredDeliverables = deliverables.filter((d) =>
    search ? d.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  const approvedCount = deliverables.filter((d) => d.status === 'approved').length;
  const awaitingCount = deliverables.filter((d) => d.status === 'submitted').length;

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || 'Projet inconnu';

  const handleCreateDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId || !formData.title) {
      toast.error('Le projet et le titre sont requis');
      return;
    }

    try {
      setIsSubmitting(true);
      // Deliverables are always created inside a project (MVP3 §5).
      const res = await fetch(`/api/v1/projects/${formData.projectId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Impossible de créer le livrable');
      }

      toast.success('Livrable créé en brouillon');
      setIsOpen(false);
      setFormData({ projectId: '', title: '', description: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitToClient = async (deliverable: Deliverable) => {
    // A rejected or revision-requested deliverable goes back out via /resubmit,
    // which bumps its version instead of reusing the consumed portal token.
    const needsResubmit =
      deliverable.status === 'rejected' || deliverable.status === 'revision_requested';
    const endpoint = needsResubmit
      ? `/api/v1/deliverables/${deliverable.id}/resubmit`
      : `/api/v1/deliverables/${deliverable.id}/submit`;

    try {
      setPendingId(deliverable.id);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // /resubmit carries the new version's fields; /submit ignores the body.
        body: JSON.stringify({
          title: deliverable.title,
          description: deliverable.description,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Soumission refusée');
      }

      toast.success(needsResubmit ? 'Nouvelle version soumise' : 'Livrable soumis au client');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la soumission');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Livrables"
        description="Soumettez vos livrables à la validation du client et suivez leurs versions."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-5 h-11 shadow-sm">
                <Plus className="mr-2 h-4 w-4" /> Nouveau livrable
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] rounded-xl">
              <form onSubmit={handleCreateDeliverable}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-foreground">Créer un livrable</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Le livrable reste en brouillon tant qu&apos;il n&apos;est pas soumis au client.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Projet *</Label>
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
                    <Label className="text-xs font-medium text-foreground">Titre *</Label>
                    <Input
                      placeholder="Ex : Maquettes v2 — page d'accueil"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Description</Label>
                    <Textarea
                      placeholder="Ce que le client doit examiner…"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="rounded-xl min-h-24 text-xs"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
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
          label="Livrables approuvés"
          value={approvedCount}
          hint="Validés par le client"
          icon={<CheckCircle2 className="h-4 w-4 text-accent" />}
        />
        <MetricCard
          label="En attente de validation"
          value={awaitingCount}
          hint="Soumis, pas encore examinés"
          icon={<Clock className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Total livrables"
          value={deliverables.length}
          hint="Toutes versions confondues"
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un livrable..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px] rounded-xl text-xs">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="submitted">Soumis</SelectItem>
              <SelectItem value="approved">Approuvés</SelectItem>
              <SelectItem value="rejected">Rejetés</SelectItem>
              <SelectItem value="revision_requested">Révision demandée</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredDeliverables.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">Aucun livrable trouvé.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Livrable</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Version</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Soumis le</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Statut</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliverables.map((deliverable) => {
                  const status = STATUS_LABELS[deliverable.status] || STATUS_LABELS.draft;
                  const isPending = pendingId === deliverable.id;
                  const canSubmit = deliverable.status !== 'submitted' && deliverable.status !== 'approved';
                  const needsResubmit =
                    deliverable.status === 'rejected' || deliverable.status === 'revision_requested';

                  return (
                    <TableRow key={deliverable.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-xs text-foreground">
                        <div className="flex items-center gap-2 font-medium">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>{deliverable.title}</span>
                        </div>
                        {deliverable.rejectionReason && (
                          <div className="text-[11px] text-destructive font-normal pl-6">
                            Motif : {deliverable.rejectionReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getProjectName(deliverable.projectId)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">v{deliverable.version}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(deliverable.submittedAt)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canSubmit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleSubmitToClient(deliverable)}
                            className="h-8 rounded-full text-[11px] text-primary hover:bg-primary/10"
                          >
                            {isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : needsResubmit ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            {needsResubmit ? 'Resoumettre' : 'Soumettre'}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {deliverable.reviewedByName
                              ? `Examiné par ${deliverable.reviewedByName}`
                              : 'Chez le client'}
                          </span>
                        )}
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
