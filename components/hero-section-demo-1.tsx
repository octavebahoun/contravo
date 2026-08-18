"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Stamp } from "@/components/stamp";

const lines = [
  { qty: 1, label: "Identité visuelle — logo + charte", price: "250 000" },
  { qty: 2, label: "Site vitrine — 5 pages", price: "240 000" },
  { qty: 1, label: "Pack réseaux sociaux — 1 mois", price: "120 000" },
];

const total = "610 000";

const ease = [0.2, 0, 0, 1] as const;

/**
 * Carte « devis » vivante du hero : numéro en mono, total en vert mobile
 * money, et le cachet qui bascule d'EN ATTENTE à SIGNÉ au clic.
 *
 * Les lignes de prestation s'écrivent l'une après l'autre — le document
 * paraît se remplir sous les yeux du visiteur, ce qui est exactement le geste
 * que vend le produit. L'échelonnement reste sous la demi-seconde au total :
 * au-delà, on attend une carte au lieu de lire le titre.
 */
export default function HeroQuoteCard() {
  const [signed, setSigned] = useState(false);
  const [impact, setImpact] = useState(false);

  const enter = (delay: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease },
  });

  return (
    <div className="relative mx-auto w-full max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease }}
        className="rounded-xl bg-card p-5 shadow-[0_1px_2px_rgb(33_22_15_/_0.06)] ring-1 ring-border sm:p-6"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <motion.div {...enter(0.24)}>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Devis
            </p>
            <p className="tabular-mono mt-1 text-sm font-semibold text-foreground">
              DEV-2026-0042
            </p>
          </motion.div>

          <motion.button
            {...enter(0.32)}
            type="button"
            onClick={() => {
              setSigned((v) => !v);
              setImpact(true);
            }}
            className="group flex cursor-pointer flex-col items-end gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label={
              signed
                ? "Devis signé. Cliquez pour revenir en attente."
                : "Devis en attente de signature. Cliquez pour marquer comme signé."
            }
          >
            <Stamp
              label={signed ? "SIGNÉ" : "EN ATTENTE"}
              tone={signed ? "success" : "warning"}
              animate={impact}
            />
            <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              cliquez pour {signed ? "revenir" : "signer"}
            </span>
          </motion.button>
        </div>

        <div className="space-y-2.5 py-4">
          {lines.map((line, idx) => (
            <motion.div
              key={line.label}
              {...enter(0.4 + idx * 0.08)}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-muted-foreground">
                <span className="tabular-mono mr-2 text-xs text-foreground/60">{line.qty}×</span>
                {line.label}
              </span>
              <span className="tabular-mono shrink-0 text-[13px] font-medium text-foreground">
                {line.price} <span className="text-muted-foreground">XOF</span>
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...enter(0.68)}
          className="flex items-baseline justify-between border-t border-border pt-4"
        >
          <span className="text-xs font-medium text-muted-foreground">Montant total</span>
          <span className="tabular-mono text-lg font-semibold text-accent">{total} XOF</span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8, ease }}
        className="mt-4 flex items-center justify-center gap-2"
        aria-hidden
      >
        <span className="h-px w-12 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          signé depuis son téléphone
        </span>
        <span className="h-px w-12 bg-border" />
      </motion.div>
    </div>
  );
}
