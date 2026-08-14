'use client';

import { useState } from 'react';
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full text-[10px] font-medium shadow-none">
            En cours
          </Badge>
        );
      case 'delivered':
        return (
          <Badge className="bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20 rounded-full text-[10px] font-medium shadow-none">
            Livré
          </Badge>
        );
      case 'on_hold':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 rounded-full text-[10px] font-medium shadow-none">
            En pause
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
            Gestion de Projets
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Suivez le déroulement de vos livrables, l'avancement et la rentabilité financière.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Nouveau Projet
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <form onSubmit={handleCreateProject}>
              <DialogHeader>
                <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Créer un projet</DialogTitle>
                <DialogDescription className="text-xs text-[#5b616e]">
                  Associez un projet à un client et définissez son budget initial.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Nom du Projet *</Label>
                  <Input
                    placeholder="Ex: Refonte Site E-commerce"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Client *</Label>
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
                  <Label className="text-xs font-medium text-[#0a0b0d]">Budget (XOF)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 500000"
                    value={formData.budgetCents}
                    onChange={(e) => setFormData({ ...formData, budgetCents: e.target.value })}
                    className="rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Description / Objectifs</Label>
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
                  className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
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
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Projets En Cours</CardTitle>
            <FolderKanban className="h-4 w-4 text-[#0052ff]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{activeCount}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Actuellement actifs</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">Projets Livrés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{deliveredCount}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Terminés et livrés au client</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#5b616e]">En attente / Pause</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-medium text-[#0a0b0d]">{draftCount}</div>
            <p className="text-[11px] text-[#7c828a] mt-1">Brouillons ou en pause</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres & Table Shadcn */}
      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher un projet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-xs"
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
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">
              Aucun projet trouvé.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Budget</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Avancement</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id} className="border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="font-medium text-xs text-[#0a0b0d]">
                      <div>{project.name}</div>
                      {project.description && (
                        <div className="text-[11px] text-[#7c828a] font-normal truncate max-w-xs">
                          {project.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {getClientName(project.clientId)}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-[#0a0b0d]">
                      {formatBudget(project.budgetCents)}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e] w-48">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>{project.status === 'delivered' ? '100%' : project.status === 'active' ? '45%' : '0%'}</span>
                        </div>
                        <Progress
                          value={project.status === 'delivered' ? 100 : project.status === 'active' ? 45 : 5}
                          className="h-1.5 bg-gray-100"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {getStatusBadge(project.status)}
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
