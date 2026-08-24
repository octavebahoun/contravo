'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Plus, Search, Building2, User, Mail, Phone, Loader2, Users2, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Stamp } from '@/components/stamp';
import { ModuleHeader, MetricCard } from '../_components/module-ui';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Client {
  id: string;
  type: 'individual' | 'company';
  displayName: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  isArchived: boolean;
  createdAt: string;
}

const mockChartData = [
  { month: 'Jan', clients: 4 },
  { month: 'Fév', clients: 7 },
  { month: 'Mar', clients: 12 },
  { month: 'Avr', clients: 18 },
  { month: 'Mai', clients: 25 },
  { month: 'Juin', clients: 34 },
];

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    type: 'company' as 'individual' | 'company',
    displayName: '',
    companyName: '',
    email: '',
    phone: '',
  });

  const { data, error, isLoading, mutate } = useSWR<{ clients: Client[] }>(
    `/api/v1/clients${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    fetcher
  );

  const clients = data?.clients || [];

  const filteredClients = clients.filter((c) => {
    if (typeFilter === 'all') return true;
    return c.type === typeFilter;
  });

  const companyCount = clients.filter((c) => c.type === 'company').length;
  const individualCount = clients.filter((c) => c.type === 'individual').length;

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.displayName || !formData.email) {
      toast.error('Le nom et l’email sont requis');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Impossible de créer le client');
      }

      toast.success('Client créé avec succès');
      setIsOpen(false);
      setFormData({ type: 'company', displayName: '', companyName: '', email: '', phone: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Clients"
        description="Centralisez votre annuaire client, coordonnées et historique de facturation."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-xs font-semibold px-5 h-11">
                <Plus className="mr-2 h-4 w-4" /> Nouveau client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-xl">
              <form onSubmit={handleCreateClient}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-foreground">Ajouter un client</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Remplissez les informations de la nouvelle fiche client.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Type de client</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val: 'individual' | 'company') => setFormData({ ...formData, type: val })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Sélectionner le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">Entreprise / Société</SelectItem>
                        <SelectItem value="individual">Particulier / Indépendant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Nom d'affichage *</Label>
                    <Input
                      placeholder="Ex: ACME Corp ou Jean Dupont"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  {formData.type === 'company' && (
                    <div className="grid gap-2">
                      <Label className="text-xs font-medium text-foreground">Raison Sociale</Label>
                      <Input
                        placeholder="Ex: ACME SARL"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Adresse Email *</Label>
                    <Input
                      type="email"
                      placeholder="contact@client.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Téléphone</Label>
                    <Input
                      placeholder="+229 01 97 00 00 00"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-primary hover:bg-primary/90 text-xs font-semibold h-11"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer le client'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPI Cards & Graphique Shadcn */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Metric Cards */}
        <div className="space-y-4 lg:col-span-1">
          <MetricCard
            label="Total clients"
            value={clients.length}
            hint="Actifs dans votre organisation"
            icon={<Users2 className="h-4 w-4 text-primary" />}
          />

          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Entreprises"
              value={companyCount}
              icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
            />

            <MetricCard
              label="Particuliers"
              value={individualCount}
              icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
            />
          </div>
        </div>

        {/* Graphique d'Acquisition Client Shadcn */}
        <Card className="rounded-xl border border-border bg-card lg:col-span-2">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Croissance du portefeuille Client</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Évolution cumulative des fiches clients créées sur les 6 derniers mois.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-44">
            <ChartContainer
              config={{
                clients: {
                  label: 'Clients',
                  color: 'hsl(var(--primary))',
                },
              }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="clients" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorClients)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Barre d'outils Recherche & Filtres */}
      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border text-xs"
            />
          </div>

          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] rounded-xl text-xs">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="company">Entreprises</SelectItem>
                <SelectItem value="individual">Particuliers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {/* Table Shadcn Clients */}
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-xs text-muted-foreground">
                Aucun client pour l'instant. Créez le premier, il sera prêt en 5 minutes.
              </p>
              <Button
                onClick={() => setIsOpen(true)}
                className="bg-primary hover:bg-primary/90 text-xs font-semibold"
              >
                <Plus className="mr-2 h-4 w-4" /> Créer un client
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Nom / Raison Sociale</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Email</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Téléphone</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow
                    key={client.id}
                    onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                    className="border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <TableCell className="font-medium text-xs text-foreground">
                      <div>{client.displayName}</div>
                      {client.companyName && (
                        <div className="text-[11px] text-muted-foreground font-normal">{client.companyName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {client.type === 'company' ? (
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span>{client.type === 'company' ? 'Entreprise' : 'Particulier'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{client.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {client.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{client.phone}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Stamp
                        label={client.isArchived ? 'Archivé' : 'Actif'}
                        tone={client.isArchived ? 'ink' : 'success'}
                      />
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