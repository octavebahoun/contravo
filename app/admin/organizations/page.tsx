"use client"

import * as React from "react"
import useSWR, { mutate } from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Search,
  SlidersHorizontal,
  ShieldAlert,
  Edit2,
  RefreshCw,
  Ban,
  UserCheck,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Erreur de chargement")
  return res.json()
})

interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  subscriptionStatus: string
  createdAt: string
  customMaxMembers: number | null
  customMaxClients: number | null
  customMaxProjects: number | null
  customMaxStorageBytes: string | null
  customMaxApiKeys: number | null
  customMaxWebhookEndpoints: number | null
  memberCount: number
}

export default function AdminOrganizationsPage() {
  const [search, setSearch] = React.useState("")
  const [planFilter, setPlanFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  
  // Dialog state for quotas override
  const [selectedOrg, setSelectedOrg] = React.useState<Organization | null>(null)
  const [quotaForm, setQuotaForm] = React.useState({
    customMaxMembers: "",
    customMaxClients: "",
    customMaxProjects: "",
    customMaxStorageMB: "",
    customMaxApiKeys: "",
    customMaxWebhookEndpoints: "",
  })
  
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Construct query parameters
  const queryParams = new URLSearchParams()
  if (search) queryParams.set("search", search)
  if (planFilter !== "all") queryParams.set("plan", planFilter)
  if (statusFilter !== "all") queryParams.set("status", statusFilter)

  const { data, error, isLoading } = useSWR(
    `/api/v1/admin/organizations?${queryParams.toString()}`,
    fetcher
  )

  const handleOpenQuotaDialog = (org: Organization) => {
    setSelectedOrg(org)
    // Convert BigInt bytes to MB for display, or leave empty if null
    const storageMB = org.customMaxStorageBytes 
      ? Math.round(Number(org.customMaxStorageBytes) / (1024 * 1024)).toString()
      : ""
      
    setQuotaForm({
      customMaxMembers: org.customMaxMembers?.toString() || "",
      customMaxClients: org.customMaxClients?.toString() || "",
      customMaxProjects: org.customMaxProjects?.toString() || "",
      customMaxStorageMB: storageMB,
      customMaxApiKeys: org.customMaxApiKeys?.toString() || "",
      customMaxWebhookEndpoints: org.customMaxWebhookEndpoints?.toString() || "",
    })
  }

  const handleUpdateQuota = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrg) return

    setIsSubmitting(true)
    try {
      // Parse inputs. Empty fields are sent as null to clear overrides.
      const payload = {
        customMaxMembers: quotaForm.customMaxMembers ? parseInt(quotaForm.customMaxMembers) : null,
        customMaxClients: quotaForm.customMaxClients ? parseInt(quotaForm.customMaxClients) : null,
        customMaxProjects: quotaForm.customMaxProjects ? parseInt(quotaForm.customMaxProjects) : null,
        customMaxStorageBytes: quotaForm.customMaxStorageMB 
          ? parseInt(quotaForm.customMaxStorageMB) * 1024 * 1024 
          : null,
        customMaxApiKeys: quotaForm.customMaxApiKeys ? parseInt(quotaForm.customMaxApiKeys) : null,
        customMaxWebhookEndpoints: quotaForm.customMaxWebhookEndpoints 
          ? parseInt(quotaForm.customMaxWebhookEndpoints) 
          : null,
      }

      const res = await fetch(`/api/v1/admin/organizations/${selectedOrg.id}/quota`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error("Erreur de mise à jour des quotas")

      toast.success("Surcharges de quota mises à jour avec succès.")
      setSelectedOrg(null)
      mutate(`/api/v1/admin/organizations?${queryParams.toString()}`)
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la mise à jour des quotas.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleSuspension = async (orgId: string, currentStatus: string) => {
    const isSuspended = currentStatus === "suspended"
    const action = isSuspended ? "reactivate" : "suspend"
    const confirmMessage = isSuspended
      ? "Voulez-vous réactiver cette organisation ?"
      : "Voulez-vous suspendre cette organisation ? Ses membres ne pourront plus accéder à leurs données."

    if (!confirm(confirmMessage)) return

    try {
      const res = await fetch(`/api/v1/admin/organizations/${orgId}/suspend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) throw new Error("Erreur lors du changement de statut")

      const data = await res.json()
      toast.success(data.message)
      mutate(`/api/v1/admin/organizations?${queryParams.toString()}`)
    } catch (err: any) {
      toast.error(err.message || "Une erreur est survenue.")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestion des Organisations</h1>
          <p className="text-muted-foreground">
            Gérez le statut, suspendez les comptes et ajustez les quotas sur mesure.
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher nom ou slug..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les plans</SelectItem>
                  <SelectItem value="free">Gratuit</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="suspended">Suspendu</SelectItem>
                  <SelectItem value="cancelled">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setSearch("")
                  setPlanFilter("all")
                  setStatusFilter("all")
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <div className="text-xs text-muted-foreground">
                {isLoading ? "Recherche..." : `${data?.organizations?.length || 0} résultats`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organizations Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Membres</TableHead>
                <TableHead>Quotas Personnalisés</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Chargement des organisations...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-red-500">
                    Erreur de chargement des organisations.
                  </TableCell>
                </TableRow>
              ) : data?.organizations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucune organisation trouvée.
                  </TableCell>
                </TableRow>
              ) : (
                data.organizations.map((org: Organization) => (
                  <TableRow key={org.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                    <TableCell>
                      <div className="font-semibold">{org.name}</div>
                      <div className="text-xs text-muted-foreground">{org.slug}</div>
                    </TableCell>
                    <TableCell>
                      {org.plan === "free" ? (
                        <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 uppercase font-mono text-[10px]">
                          {org.plan}
                        </Badge>
                      ) : org.plan === "pro" ? (
                        <Badge className="bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 uppercase font-mono text-[10px]">
                          {org.plan}
                        </Badge>
                      ) : (
                        <Badge className="bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 uppercase font-mono text-[10px]">
                          {org.plan}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {org.subscriptionStatus === "suspended" ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <Ban className="h-3 w-3" /> Suspendu
                        </Badge>
                      ) : org.subscriptionStatus === "cancelled" ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 w-fit">
                          Annulé
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 w-fit">
                          Actif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{org.memberCount}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5 text-muted-foreground max-w-[200px] truncate">
                        {org.customMaxMembers && <div>Membres: {org.customMaxMembers}</div>}
                        {org.customMaxClients && <div>Clients: {org.customMaxClients}</div>}
                        {org.customMaxProjects && <div>Projets: {org.customMaxProjects}</div>}
                        {org.customMaxStorageBytes && (
                          <div>
                            Stockage: {Math.round(Number(org.customMaxStorageBytes) / (1024 * 1024))} Mo
                          </div>
                        )}
                        {!org.customMaxMembers &&
                          !org.customMaxClients &&
                          !org.customMaxProjects &&
                          !org.customMaxStorageBytes && (
                            <span className="italic text-gray-400">Limites par défaut</span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenQuotaDialog(org)}
                          title="Surcharger les limites"
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" /> Quotas
                        </Button>
                        <Button
                          variant={org.subscriptionStatus === "suspended" ? "outline" : "destructive"}
                          size="sm"
                          onClick={() => handleToggleSuspension(org.id, org.subscriptionStatus)}
                        >
                          {org.subscriptionStatus === "suspended" ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                              <span className="text-emerald-600">Réactiver</span>
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5 mr-1" /> Suspendre
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quotas Override Dialog */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdateQuota}>
            <DialogHeader>
              <DialogTitle>Surcharger les Quotas</DialogTitle>
              <DialogDescription>
                Configurez des limites personnalisées pour l'organisation{" "}
                <span className="font-semibold text-foreground">{selectedOrg?.name}</span>. Laissez
                vide pour restaurer les limites de leur plan standard.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxMembers" className="text-right">
                  Membres
                </Label>
                <Input
                  id="customMaxMembers"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxMembers}
                  onChange={(e) => setQuotaForm({ ...quotaForm, customMaxMembers: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxClients" className="text-right">
                  Clients
                </Label>
                <Input
                  id="customMaxClients"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxClients}
                  onChange={(e) => setQuotaForm({ ...quotaForm, customMaxClients: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxProjects" className="text-right">
                  Projets
                </Label>
                <Input
                  id="customMaxProjects"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxProjects}
                  onChange={(e) => setQuotaForm({ ...quotaForm, customMaxProjects: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxStorageMB" className="text-right text-xs">
                  Stockage (Mo)
                </Label>
                <Input
                  id="customMaxStorageMB"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxStorageMB}
                  onChange={(e) => setQuotaForm({ ...quotaForm, customMaxStorageMB: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxApiKeys" className="text-right">
                  Clés API
                </Label>
                <Input
                  id="customMaxApiKeys"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxApiKeys}
                  onChange={(e) => setQuotaForm({ ...quotaForm, customMaxApiKeys: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customMaxWebhookEndpoints" className="text-right">
                  Webhooks
                </Label>
                <Input
                  id="customMaxWebhookEndpoints"
                  type="number"
                  placeholder="Illimité"
                  className="col-span-3"
                  value={quotaForm.customMaxWebhookEndpoints}
                  onChange={(e) =>
                    setQuotaForm({ ...quotaForm, customMaxWebhookEndpoints: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSelectedOrg(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : "Sauvegarder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
