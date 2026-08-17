"use client"

import * as React from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CircleDollarSign,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  HelpCircle,
} from "lucide-react"
// The two figures on this page are not in the same unit: the aggregate is
// already in whole XOF, while `subscription_cycles.amount_cents` is in
// hundredths of XOF. Both used to go through one "euro" formatter.
import { formatMoney, formatSaasPrice } from "@/lib/money"

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Erreur de chargement")
  return res.json()
})

interface Transaction {
  id: string
  invoiceNumber: string | null
  organizationName: string
  planId: string
  amountCents: string
  currency: string
  status: string
  paidAt: string | null
  failedReason: string | null
  createdAt: string
}

export default function AdminFinancePage() {
  const { data, error, isLoading } = useSWR("/api/v1/admin/finance", fetcher)

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        Erreur de chargement des transactions financières.
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Financier</h1>
        <p className="text-muted-foreground">
          Historique des cycles de facturation, logs de webhooks et suivi des paiements GeniusPay.
        </p>
      </div>

      {/* Aggregates Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenu Total Généré</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="tabular-mono text-2xl font-bold text-accent">
                  {formatMoney(Math.round(parseFloat(data.aggregates.totalRevenueXof)), "XOF")}
                </div>
                <p className="text-xs text-muted-foreground">Volume de paiements validés</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions Réussies</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{data.aggregates.paidCount}</div>
                <p className="text-xs text-muted-foreground">Paiements confirmés</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paiements Échoués</CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {data.aggregates.failedCount}
                </div>
                <p className="text-xs text-muted-foreground">Échecs de webhook GeniusPay</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Factures En Attente</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-warning">
                  {data.aggregates.pendingCount}
                </div>
                <p className="text-xs text-muted-foreground">En cours de traitement</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-500" />
            Historique Consolidé
          </CardTitle>
          <CardDescription>
            Liste complète des factures émises et statut des webhooks de synchronisation GeniusPay.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facture N°</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Raison de l'échec (GeniusPay)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Chargement des transactions...
                  </TableCell>
                </TableRow>
              ) : data?.transactions?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Aucune transaction trouvée dans le système.
                  </TableCell>
                </TableRow>
              ) : (
                data.transactions.map((tx: Transaction) => (
                  <TableRow key={tx.id} className="hover:bg-muted">
                    <TableCell className="font-mono text-xs font-semibold">
                      {tx.invoiceNumber || "N/A"}
                    </TableCell>
                    <TableCell className="font-medium">{tx.organizationName}</TableCell>
                    <TableCell>
                      {tx.planId === "free" ? (
                        <Badge variant="outline" className="bg-muted text-foreground border-border uppercase font-mono text-[10px]">
                          {tx.planId}
                        </Badge>
                      ) : tx.planId === "pro" ? (
                        <Badge className="bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 uppercase font-mono text-[10px]">
                          {tx.planId}
                        </Badge>
                      ) : (
                        <Badge className="bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 uppercase font-mono text-[10px]">
                          {tx.planId}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-semibold">
                      {formatSaasPrice(tx.amountCents)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {tx.status === "paid" ? (
                        <Badge className="bg-accent/10 text-accent border-accent/20">
                          Payé
                        </Badge>
                      ) : tx.status === "failed" ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <AlertCircle className="h-3 w-3" /> Échoué
                        </Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning border-warning/20">
                          En attente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-rose-500 font-mono max-w-[250px] truncate">
                      {tx.failedReason || (
                        <span className="text-muted-foreground italic font-sans">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
