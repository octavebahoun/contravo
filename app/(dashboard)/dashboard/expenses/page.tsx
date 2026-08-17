'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Plus, Search, Receipt, Loader2, Trash2, Wallet, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetcher,
  formatAmount,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
} from '../_components/module-ui';

interface Expense {
  id: string;
  projectId: string;
  category: string;
  description: string;
  amountCents: string;
  currency: string;
  incurredOn: string;
  vendor: string | null;
  billable: boolean;
  reimbursed: boolean;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

/** Categories from the `expenses.category` enum comment (lib/db/schema.ts). */
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'salary', label: 'Salaires' },
  { value: 'subcontractor', label: 'Sous-traitance' },
  { value: 'software', label: 'Logiciels' },
  { value: 'hardware', label: 'Matériel' },
  { value: 'travel', label: 'Déplacements' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Autre' },
];

const categoryLabel = (value: string) =>
  CATEGORIES.find((c) => c.value === value)?.label || value;

export default function ExpensesPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    projectId: '',
    category: 'other',
    description: '',
    amount: '',
    incurredOn: new Date().toISOString().split('T')[0],
    vendor: '',
    billable: false,
  });

  const { data, isLoading, mutate } = useSWR<{ expenses: Expense[] }>(
    `/api/v1/expenses${categoryFilter !== 'all' ? `?category=${categoryFilter}` : ''}`,
    fetcher
  );
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);

  const expenses = data?.expenses || [];
  const projects = projectsData?.projects || [];

  const filteredExpenses = expenses.filter((expense) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      expense.description.toLowerCase().includes(needle) ||
      (expense.vendor || '').toLowerCase().includes(needle)
    );
  });

  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amountCents), 0);
  const billableAmount = expenses
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + Number(e.amountCents), 0);
  const currency = expenses[0]?.currency || 'XOF';

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || 'Projet inconnu';

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(formData.amount);
    if (!formData.projectId || !formData.description || !Number.isFinite(amount) || amount <= 0) {
      toast.error('Le projet, la description et un montant valide sont requis');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: formData.projectId,
          category: formData.category,
          description: formData.description,
          // Stored as-is, like the quotes/invoices screens do for XOF.
          amountCents: Math.round(amount),
          incurredOn: formData.incurredOn,
          vendor: formData.vendor || null,
          billable: formData.billable,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Impossible d’enregistrer la dépense');
      }

      toast.success('Dépense enregistrée');
      setIsOpen(false);
      setFormData({
        projectId: '',
        category: 'other',
        description: '',
        amount: '',
        incurredOn: new Date().toISOString().split('T')[0],
        vendor: '',
        billable: false,
      });
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l’enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setPendingId(id);
      const res = await fetch(`/api/v1/expenses/${id}`, { method: 'DELETE' });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Suppression refusée');
      }

      toast.success('Dépense supprimée');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Dépenses"
        description="Suivez les coûts engagés par projet et identifiez ce qui est refacturable."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-5 h-11 shadow-sm">
                <Plus className="mr-2 h-4 w-4" /> Nouvelle dépense
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] rounded-xl">
              <form onSubmit={handleCreateExpense}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-foreground">
                    Enregistrer une dépense
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Elle sera imputée au projet et prise en compte dans sa rentabilité.
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
                    <Label className="text-xs font-medium text-foreground">Catégorie</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(val) => setFormData({ ...formData, category: val })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Description *</Label>
                    <Input
                      placeholder="Ex : Licence Figma — équipe design"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-medium text-foreground">Montant ({currency}) *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="25000"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="rounded-xl"
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-xs font-medium text-foreground">Date *</Label>
                      <Input
                        type="date"
                        value={formData.incurredOn}
                        onChange={(e) => setFormData({ ...formData, incurredOn: e.target.value })}
                        className="rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Fournisseur</Label>
                    <Input
                      placeholder="Ex : Figma Inc."
                      value={formData.vendor}
                      onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="billable"
                      checked={formData.billable}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, billable: checked === true })
                      }
                    />
                    <Label htmlFor="billable" className="text-xs font-medium text-foreground">
                      Refacturable au client
                    </Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer la dépense'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <MetricCard
          label="Total dépensé"
          value={formatAmount(totalAmount, currency)}
          hint="Toutes catégories confondues"
          icon={<Wallet className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Refacturable"
          value={formatAmount(billableAmount, currency)}
          hint="À répercuter sur les factures"
          icon={<HandCoins className="h-4 w-4 text-accent" />}
        />
        <MetricCard
          label="Nombre de dépenses"
          value={expenses.length}
          hint="Lignes enregistrées"
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une dépense ou un fournisseur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border text-xs"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px] rounded-xl text-xs">
              <SelectValue placeholder="Toutes les catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">Aucune dépense trouvée.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Description</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Catégorie</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Montant</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Refacturable</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} className="border-border hover:bg-muted/50">
                    <TableCell className="text-xs text-foreground">
                      <div className="flex items-center gap-2 font-medium">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span>{expense.description}</span>
                      </div>
                      {expense.vendor && (
                        <div className="text-[11px] text-muted-foreground font-normal pl-6">{expense.vendor}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getProjectName(expense.projectId)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{categoryLabel(expense.category)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(expense.incurredOn)}</TableCell>
                    <TableCell className="tabular-mono text-xs font-medium text-foreground">
                      {formatAmount(expense.amountCents, expense.currency)}
                    </TableCell>
                    <TableCell>
                      {expense.billable ? (
                        <StatusBadge tone="success">Refacturable</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Interne</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === expense.id}
                        onClick={() => handleDelete(expense.id)}
                        className="h-8 rounded-full text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        {pendingId === expense.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Supprimer
                      </Button>
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
