"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ShieldAlert, LogOut, Mail } from "lucide-react"

export default function SuspendedPage() {
  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/sign-out", { method: "POST" })
      window.location.href = "/sign-in"
    } catch (err) {
      window.location.href = "/sign-in"
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 text-center bg-white dark:bg-gray-950 p-8 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl">
        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 animate-bounce">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Accès Suspendu
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre organisation a été temporairement suspendue par l'administration.
          </p>
        </div>

        <div className="space-y-4 rounded-lg bg-red-50/50 dark:bg-red-950/10 p-4 text-left text-sm border border-red-100/50 dark:border-red-900/10">
          <p className="text-red-800 dark:text-red-300 font-medium">
            Pourquoi mon accès est-il restreint ?
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-red-700/80 dark:text-red-400/80">
            <li>Défaut de paiement récurrent (Stripe/GeniusPay).</li>
            <li>Non-respect des limites d'usage autorisées.</li>
            <li>Décision administrative ou de sécurité.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            asChild
            className="w-full bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
          >
            <a href="mailto:support@contravo.com" className="flex items-center justify-center gap-2">
              <Mail className="h-4 w-4" />
              Contacter le support
            </a>
          </Button>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Se déconnecter
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          ID de l'incident : <span className="font-mono bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-[10px]">ERR_ORG_SUSPENDED</span>
        </div>
      </div>
    </div>
  )
}
