'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { menuItems } from '../_data/content';
import { duration, ease, useScrolled } from './motion';

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled();

  return (
    <header
      className={[
        'sticky top-0 z-50 bg-background/85 backdrop-blur-md transition-shadow duration-300',
        // En haut de page l'en-tête se fond dans le hero ; dès que le contenu
        // passe dessous, une bordure et une ombre le détachent.
        scrolled
          ? 'border-b border-border shadow-[0_1px_12px_-6px_rgb(33_22_15_/_0.25)]'
          : 'border-b border-transparent',
      ].join(' ')}
    >
      <div className="mx-auto max-w-7xl px-6">
        <nav className="flex items-center justify-between py-4">
          <Link
            href="/"
            className="font-heading text-lg font-extrabold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            Contravo
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <ul className="flex items-center gap-6">
              {menuItems.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="group relative py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    {/* Le trait se déploie depuis la gauche — un `scaleX`, donc
                        aucune largeur animée et aucun recalcul de mise en page. */}
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-primary transition-transform duration-200 ease-out group-hover:scale-x-100"
                    />
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Connexion
                </Link>
              </li>
            </ul>
            <Button size="sm" asChild className="h-9 px-4 text-sm font-semibold">
              <Link href="/sign-up">Créer mon premier devis</Link>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-border p-2 text-foreground transition-colors hover:bg-muted md:hidden"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
          >
            {/* Les deux icônes se croisent en rotation plutôt que de se
                remplacer d'un coup : c'est le même bouton, pas deux états. */}
            <span className="relative grid size-5 place-items-center">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={open ? 'close' : 'open'}
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: duration.fast, ease }}
                  className="absolute inset-0 grid place-items-center"
                >
                  {open ? <X className="size-5" /> : <Menu className="size-5" />}
                </motion.span>
              </AnimatePresence>
            </span>
          </button>
        </nav>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.fast * 1.4, ease }}
            className="overflow-hidden border-t border-border bg-background md:hidden"
          >
            <ul className="space-y-1 px-6 py-4">
              {menuItems.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Connexion
                </Link>
              </li>
            </ul>

            <div className="px-6 pb-6">
              <Button asChild className="w-full text-sm font-semibold">
                <Link href="/sign-up" onClick={() => setOpen(false)}>
                  Créer mon premier devis
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
