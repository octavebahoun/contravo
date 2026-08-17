"use client"

import * as React from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TrendingUp,
  Users,
  FileText,
  KeyRound,
  ShieldCheck,
  Server,
  Activity,
  HeartPulse,
} from "lucide-react"
import { formatSaasPrice } from "@/lib/money"

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Erreur de chargement")
  return res.json()
})

export default function AdminDashboardPage() {
  const { data, error, isLoading } = useSWR("/api/v1/admin/dashboard", fetcher)

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
        Erreur de chargement des données. Veuillez vérifier vos autorisations.
      </div>
    )
  }

  // The plans are priced in XOF, not in euros: this used to label the figure
  // "€" and divide it by 100 on top of an amount that was already whole XOF,
  // so an MRR of 15 000 XOF was displayed as "150,00 €".
  const formatPrice = (hundredthsOfXof: number) => formatSaasPrice(hundredthsOfXof)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vue d'ensemble</h1>
        <p className="text-muted-foreground">
          Indicateurs clés de performance et gouvernance de la plateforme Contravo.
        </p>
      </div>

      {/* Grid 1: Key Financials */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenu Mensuel Récurent (MRR)</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatPrice(data.mrr)}
                </div>
                <p className="text-xs text-muted-foreground">
                  ARR estimé : {formatPrice(data.arr)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organisations Actives</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{data.activeOrganizations}</div>
                <p className="text-xs text-muted-foreground">
                  Taux de Churn : {data.churnRate.toFixed(1)}%
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distribution des Plans</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400">
                  Pro: {data.plansDistribution.pro}
                </Badge>
                <Badge className="bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
                  Biz: {data.plansDistribution.business}
                </Badge>
                <Badge className="bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400">
                  Gratuit: {data.plansDistribution.free}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Santé Système</CardTitle>
            <HeartPulse className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>API : {data.systemHealth.apiStatus}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>GeniusPay : {data.systemHealth.geniusPayStatus}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid 2: Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Document metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-500" />
              Volume de Documents
            </CardTitle>
            <CardDescription>
              Volume total de fichiers et contrats gérés sur la plateforme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Total Documents</span>
                  <div className="text-2xl font-semibold">{data.documents.total}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Devis</span>
                  <div className="text-2xl font-semibold">{data.documents.quotes}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Contrats</span>
                  <div className="text-2xl font-semibold">{data.documents.contracts}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Factures</span>
                  <div className="text-2xl font-semibold">{data.documents.invoices}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Infrastructure Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-cyan-500" />
              Infrastructure & API
            </CardTitle>
            <CardDescription>
              Utilisation des outils développeurs et intégrations webhook actives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Clés API Actives</span>
                  </div>
                  <span className="font-semibold">{data.infrastructure.activeApiKeys}</span>
                </div>
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Endpoints Webhook Actifs</span>
                  </div>
                  <span className="font-semibold">{data.infrastructure.activeWebhooks}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
