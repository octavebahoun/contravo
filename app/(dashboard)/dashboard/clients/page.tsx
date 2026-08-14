'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Plus, Search, Building2, User, Mail, Phone, Loader2, Users2, Filter } from 'lucide-react';
import { toast } from 'sonner';

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

      toast.success('Client ajouté avec succès');
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
      {/* Header Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
            Gestion des Clients (CRM)
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Centralisez votre annuaire client, coordonnées et historique de facturation.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Nouveau Client
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <form onSubmit={handleCreateClient}>
              <DialogHeader>
                <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Ajouter un client</DialogTitle>
                <DialogDescription className="text-xs text-[#5b616e]">
                  Remplissez les informations de la nouvelle fiche client.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Type de client</Label>
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
                  <Label className="text-xs font-medium text-[#0a0b0d]">Nom d'affichage *</Label>
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
                    <Label className="text-xs font-medium text-[#0a0b0d]">Raison Sociale</Label>
                    <Input
                      placeholder="Ex: ACME SARL"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Adresse Email *</Label>
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
                  <Label className="text-xs font-medium text-[#0a0b0d]">Téléphone</Label>
                  <Input
                    placeholder="+225 07 00 00 00 00"
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
                  className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer la fiche client'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards & Graphique Shadcn */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Metric Cards */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="rounded-2xl border border-gray-200 bg-white">
            <CardHeader className="p-5 flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-[#5b616e]">Total Clients</CardTitle>
              <Users2 className="h-4 w-4 text-[#0052ff]" />
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-2xl font-medium text-[#0a0b0d]">{clients.length}</div>
              <p className="text-[11px] text-[#7c828a] mt-1">Actifs dans votre organisation</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="rounded-2xl border border-gray-200 bg-white">
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-[11px] font-medium text-[#5b616e] flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-[#5b616e]" /> Entreprises
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-xl font-medium text-[#0a0b0d]">{companyCount}</div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-gray-200 bg-white">
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-[11px] font-medium text-[#5b616e] flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-[#5b616e]" /> Particuliers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-xl font-medium text-[#0a0b0d]">{individualCount}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Graphique d'Acquisition Client Shadcn */}
        <Card className="rounded-2xl border border-gray-200 bg-white lg:col-span-2">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium text-[#0a0b0d]">Croissance du portefeuille Client</CardTitle>
            <CardDescription className="text-xs text-[#5b616e]">
              Évolution cumulative des fiches clients créées sur les 6 derniers mois.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-44">
            <ChartContainer
              config={{
                clients: {
                  label: 'Clients',
                  color: '#0052ff',
                },
              }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0052ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0052ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7c828a' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7c828a' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="clients" stroke="#0052ff" strokeWidth={2} fillOpacity={1} fill="url(#colorClients)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Barre d'outils Recherche & Filtres */}
      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-xs"
            />
          </div>

          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-[#7c828a]" />
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
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">
              Aucun client trouvé pour ces critères.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Nom / Raison Sociale</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Email</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Téléphone</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="font-medium text-xs text-[#0a0b0d]">
                      <div>{client.displayName}</div>
                      {client.companyName && (
                        <div className="text-[11px] text-[#7c828a] font-normal">{client.companyName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      <div className="flex items-center gap-1.5">
                        {client.type === 'company' ? (
                          <Building2 className="h-3.5 w-3.5 text-[#7c828a]" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-[#7c828a]" />
                        )}
                        <span>{client.type === 'company' ? 'Entreprise' : 'Particulier'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-[#7c828a]" />
                        <span>{client.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[#5b616e]">
                      {client.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-[#7c828a]" />
                          <span>{client.phone}</span>
                        </div>
                      ) : (
                        <span className="text-[#a8acb3]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          !client.isArchived
                            ? 'bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20 rounded-full text-[10px] font-medium'
                            : 'bg-gray-100 text-gray-500 border-gray-200 rounded-full text-[10px] font-medium'
                        }
                      >
                        {!client.isArchived ? 'Actif' : 'Archivé'}
                      </Badge>
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
