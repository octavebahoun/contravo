'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { menuItems } from '../_data/content';

/**
 * Landing header with a mobile drawer (structure from the Finwise template, MIT).
 *
 * Sticky and translucent so the grid backdrop of the hero stays visible while
 * scrolling.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="relative mx-auto max-w-7xl">
        {/* Left vertical border */}
        <div className="absolute inset-y-0 left-0 w-px bg-border/40" />
        {/* Right vertical border */}
        <div className="absolute inset-y-0 right-0 w-px bg-border/40" />

        <nav className="flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center" aria-label="Contravo — accueil">
            <Image
              src="/logo.webp"
              alt="Contravo"
              width={132}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>

          <ul className="hidden items-center gap-8 md:flex">
            {menuItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" asChild>
              <Link href="/sign-in">Se connecter</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Créer un compte</Link>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-foreground md:hidden"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {open ? (
        <div className="border-t border-border bg-background md:hidden">
          <ul className="space-y-1 px-4 py-3">
            {menuItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" asChild>
              <Link href="/sign-in">Se connecter</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Créer un compte</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
