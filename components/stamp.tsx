"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Le cachet — signature visuelle de Contravo.
 *
 * Les statuts de documents sont rendus comme de vrais tampons : légère
 * rotation, bordure épaisse, mono uppercase, coin supérieur gauche plié.
 * Au changement de statut, passer `animate` pour l'impact (spring 250-300ms).
 * `prefers-reduced-motion` : tampon statique.
 */
export type StampTone = "success" | "warning" | "destructive" | "ink";

const toneStyles: Record<StampTone, string> = {
  success: "border-accent/80 text-accent",
  warning: "border-warning/80 text-warning",
  destructive: "border-destructive/80 text-destructive",
  ink: "border-foreground/50 text-foreground/70",
};

export interface StampProps {
  label: string;
  tone?: StampTone;
  className?: string;
  /** Joue l'impact du cachet (spring) à l'apparition — un seul par changement de statut. */
  animate?: boolean;
  /** Nom accessible — par défaut le libellé lui-même. */
  ariaLabel?: string;
}

export function Stamp({
  label,
  tone = "ink",
  className,
  animate = false,
  ariaLabel,
}: StampProps) {
  const reducedMotion = useReducedMotion();

  const stamp = (
    <span
      aria-label={ariaLabel ?? label}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-[5px] border-2 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]",
        "-rotate-2",
        toneStyles[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 size-0 border-t-[9px] border-r-[9px] border-t-foreground/15 border-r-transparent"
      />
      {label}
    </span>
  );

  if (!animate || reducedMotion) {
    return stamp;
  }

  return (
    <motion.span
      className="inline-flex"
      initial={{ scale: 1.15, rotate: -6 }}
      animate={{ scale: 1, rotate: -2 }}
      transition={{ type: "spring", stiffness: 480, damping: 20, mass: 0.55 }}
    >
      {stamp}
    </motion.span>
  );
}