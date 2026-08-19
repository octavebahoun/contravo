import type { ReactNode } from 'react';
import { lastUpdated } from '../_data/legal';

/**
 * Habillage commun aux trois pages légales.
 *
 * Une colonne étroite plutôt que la pleine largeur des sections marketing :
 * ce sont des pages qui se lisent, et une ligne de texte au-delà d'environ
 * 75 caractères se relit mal. Les composants ci-dessous ne définissent aucune
 * couleur ni taille propre — uniquement les jetons existants de la charte.
 */
export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Dernière mise à jour : {lastUpdated}
      </p>
      <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {intro ? <p className="mt-4 text-base leading-relaxed text-muted-foreground">{intro}</p> : null}
      <div className="mt-12 space-y-12">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

/** Paire libellé / valeur, pour les identités et les coordonnées. */
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:gap-6">
      <span className="w-56 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc marker:text-muted-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}
