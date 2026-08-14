"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricing } from "../_data/content";

export function PricingTable() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  // Custom discounted prices for yearly billing period
  const getPriceDetails = (planName: string, monthlyPrice: string) => {
    if (planName === "Free") {
      return { price: "0", note: "" };
    }
    if (planName === "Pro") {
      return billingPeriod === "monthly"
        ? { price: "15 000", note: "" }
        : { price: "12 000", note: "Facturé 144 000 XOF/an" };
    }
    // Business
    return billingPeriod === "monthly"
      ? { price: "45 000", note: "" }
      : { price: "36 000", note: "Facturé 432 000 XOF/an" };
  };

  return (
    <div className="dark bg-zinc-950 text-zinc-50 rounded-3xl border border-zinc-800 p-8 shadow-2xl relative overflow-hidden">
      {/* Plus signs at the corners for blueprint aesthetics */}
      <span className="absolute -top-1 -left-1 font-mono text-zinc-600 select-none pointer-events-none text-xl">+</span>
      <span className="absolute -top-1 -right-1 font-mono text-zinc-600 select-none pointer-events-none text-xl">+</span>
      <span className="absolute -bottom-2 -left-1 font-mono text-zinc-600 select-none pointer-events-none text-xl">+</span>
      <span className="absolute -bottom-2 -right-1 font-mono text-zinc-600 select-none pointer-events-none text-xl">+</span>

      {/* Header */}
      <div className="text-center py-8 relative">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Choisissez le plan qui répond à vos besoins
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400 text-sm sm:text-base">
          Commencez gratuitement, changez de plan quand vous grandissez.
        </p>

        {/* Indicator note for placeholder prices */}
        {pricing.placeholder && (
          <p className="mx-auto mt-3 max-w-md rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1 text-center text-xs text-amber-400">
            {pricing.note}
          </p>
        )}

        {/* Toggle billing period */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center rounded-full bg-zinc-900 p-1 border border-zinc-800">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                billingPeriod === "monthly"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                billingPeriod === "yearly"
                  ? "bg-emerald-950 border border-emerald-800 text-emerald-300 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Annuel
              <span className="inline-block rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-400 uppercase">
                -20%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of pricing cards */}
      <div className="mt-12 grid border-t border-zinc-800 lg:grid-cols-3 relative">
        {pricing.plans.map((plan, idx) => {
          const { price, note } = getPriceDetails(plan.name, plan.price);

          return (
            <div
              key={plan.name}
              className={`flex flex-col p-8 ${
                idx > 0 ? "border-t lg:border-t-0 lg:border-l border-zinc-800" : ""
              } ${plan.highlighted ? "bg-zinc-900/20" : ""}`}
            >
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white tracking-wide uppercase">
                    {plan.name}
                  </h3>
                  {plan.highlighted && (
                    <span className="rounded-full bg-emerald-950 border border-emerald-800 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      Recommandé
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">
                    {price}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {plan.currency}
                    {plan.period}
                  </span>
                </div>
                {note && <p className="mt-1.5 text-xs text-emerald-400/80 font-mono">{note}</p>}

                <p className="mt-4 text-xs text-zinc-400 min-h-[32px]">
                  {plan.description}
                </p>

                <ul className="mt-8 space-y-4 border-t border-zinc-800/50 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-xs text-zinc-300">
                      <span className="rounded-full bg-zinc-900 p-0.5 border border-zinc-800 mt-0.5">
                        <Check className="h-3 w-3 text-emerald-400" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-800/50">
                <Button
                  asChild
                  className={`w-full font-semibold transition-all py-5 ${
                    plan.highlighted
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                  }`}
                >
                  <Link href="/sign-up">{plan.cta}</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom section (Team offer and Testimonial) */}
      <div className="mt-8 border-t border-zinc-800 pt-8 grid gap-8 md:grid-cols-5 relative">
        <div className="md:col-span-3 flex flex-col justify-between p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
          <div>
            <h4 className="text-base font-bold text-white">
              Une grande équipe ou des besoins spécifiques ?
            </h4>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-md">
              Intégrez tous vos collaborateurs, bénéficiez d'une assistance prioritaire, de limites de stockage adaptées et de workflows automatisés personnalisés.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-4 px-5">
              <Link href="/sign-up">Essai gratuit</Link>
            </Button>
            <Button variant="outline" asChild className="bg-transparent border-zinc-700 hover:bg-zinc-900 hover:text-white text-zinc-300 font-semibold text-xs py-4 px-5">
              <Link href="/sign-up" className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5" />
                Contacter le support
              </Link>
            </Button>
          </div>
        </div>

        <div className="md:col-span-2 flex flex-col justify-between p-4 border-l border-zinc-800/50 pl-4 md:pl-8">
          <blockquote className="text-xs italic text-zinc-300 leading-relaxed">
            "Contravo a simplifié toute la gestion de nos devis et le suivi des signatures électroniques. C'est simple, rapide et sans fioritures inutiles."
          </blockquote>
          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 h-8 w-8 flex items-center justify-center font-bold text-xs">
              MS
            </div>
            <div>
              <p className="text-xs font-bold text-white">Michel Scarn</p>
              <p className="text-[10px] text-zinc-500">Side projects builder</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
