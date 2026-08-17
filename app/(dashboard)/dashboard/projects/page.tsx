'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, FolderKanban, Clock, CheckCircle2, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { Stamp, type StampTone } from '@/components/stamp';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Project {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  status: 'draft' | 'active' | 'on_hold' | 'delivered' | 'cancelled' | 'archived';
  budgetCents?: string | number | null;
  currency: string;
  createdAt: string;
}

interface Client {
  id: string;
  displayName: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    clientId: '',
    description: '',
    budgetCents: '',
    status: 'active',
  });

  const { data: projectsData, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    `/api/v1/projects${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
    fetcher
  );

  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients', fetcher);

  const projects = projectsData?.projects || [];
  const clients = clientsData?.clients || [];

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = projects.filter((p) => p.status === 'active').length;
  const deliveredCount = projects.filter((p) => p.status === 'delivered').length;
  const draftCount = projects.filter((p) => p.status === 'draft' || p.status === 'on_hold').length;

  const getClientName = (clientId: string) => {
    const found = clients.find((c) => c.id === clientId);
    return found ? found.displayName : 'Client non assigné';
  };

  const formatBudget = (cents?: string | number | null) => {
    if (!cents) return '0 XOF';
    const val = typeof cents === 'string' ? parseInt(cents, 10) : cents;
    return `${val.toLocaleString()} XOF`;
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.clientId) {
      toast.error('Le nom du projet et le client sont obligatoires');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          budgetCents: formData.budgetCents ? parseInt(formData.budgetCents, 10) : 0,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Impossible de créer le projet');
      }

      toast.success('Projet créé avec succès');
      setIsOpen(false);
      setFormData({ name: '', clientId: '', description: '', budgetCents: '', status: 'active' });
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  const PROJECT_STAMP: Record<string, { label: string; tone: StampTone }> = {
    active: { label: 'En cours', tone: 'warning' },
    delivered: { label: 'Livré', tone: 'success' },
    on_hold: { label: 'En pause', tone: 'warning' },
    cancelled: { label: 'Annulé', tone: 'destructive' },
    archived: { label: 'Archivé', tone: 'ink' },
  };

  const getStatusStamp = (status: string) => {
    const s = PROJECT_STAMP[status] ?? { label: 'Brouillon', tone: 'ink' as const };
    return <Stamp label={s.label} tone={s.tone} />;
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Style Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            Gestion de Projets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Suivez le déroulement de vos livrables, l'avancement et la rentabilité financière.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Nouveau Projet
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-xl">
            <form onSubmit={handleCreateProject}>
              <DialogHeader>
                <DialogTitle className="text-lg font-normal text-foreground">Créer un projet</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Associez un projet à un client et définissez son budget initial.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-foreground">Nom du Projet *</Label>
                  <Input
                    placeholder="Ex: Refonte Site E-commerce"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-foreground">Client *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(val) => setFormData({ ...formData, clientId: val })}
                  >
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue placeholder="Sélectionner le client" />
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
                  <Label className="text-xs font-medium text-foreground">Budget (XOF)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 500000"
                    value={formData.budgetCents}
                    onChange={(e) => setFormData({ ...formData, budgetCents: e.target.value })}
                    className="rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-foreground">Description / Objectifs</Label>
                  <Input
                    placeholder="Objectifs principaux du projet..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer le projet'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Projets En Cours</CardTitle>
            <FolderKanban className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-foreground">{activeCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Actuellement actifs</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Projets Livrés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-foreground">{deliveredCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Terminés et livrés au client</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">En attente / Pause</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-foreground">{draftCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Brouillons ou en pause</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres & Table Shadcn */}
      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un projet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-xl text-xs">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">En cours</SelectItem>
              <SelectItem value="delivered">Livrés</SelectItem>
              <SelectItem value="on_hold">En pause</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Aucun projet trouvé.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Budget</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Avancement</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                    className="border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <TableCell className="font-medium text-xs text-foreground">
                      <div>{project.name}</div>
                      {project.description && (
                        <div className="text-[11px] text-muted-foreground font-normal truncate max-w-xs">
                          {project.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {getClientName(project.clientId)}
                    </TableCell>
                    <TableCell className="tabular-mono text-xs font-medium text-foreground">
                      {formatBudget(project.budgetCents)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground w-48">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>{project.status === 'delivered' ? '100%' : project.status === 'active' ? '45%' : '0%'}</span>
                        </div>
                        <Progress
                          value={project.status === 'delivered' ? 100 : project.status === 'active' ? 45 : 5}
                          className="h-1.5 bg-muted"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {getStatusStamp(project.status)}
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
