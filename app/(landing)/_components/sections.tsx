import Link from 'next/link';
import { FileText, PenLine, Receipt, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Stamp } from '@/components/stamp';
import HeroQuoteCard from '@/components/hero-section-demo-1';
import { Reveal, RevealChild } from './motion';
import { siteDetails, heroDetails, proofStats, problemDetails, solutionDetails, stepsDetails, faqs, ctaDetails } from '../_data/content';

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="block font-heading text-xs font-semibold uppercase tracking-[0.14em] text-primary">
      {children}
    </span>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <Reveal variants={undefined} amount={0.1}>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Pour freelances, agences et artisans digitaux
            </span>
            <h1 className="mt-5 font-heading text-4xl font-extrabold leading-[1.05] tracking-normal text-foreground sm:text-5xl lg:text-[56px]">
              Faites signer vos devis.{' '}
              <span className="text-primary">Encaissé plus vite.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {heroDetails.subheading}
            </p>
          </Reveal>
          <Reveal amount={0.1} className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="h-11 px-6 text-sm font-semibold">
                <Link href={heroDetails.primaryCta.href}>{heroDetails.primaryCta.label}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-11 bg-card px-6 text-sm font-medium">
                <Link href={heroDetails.secondaryCta.href}>
                  {heroDetails.secondaryCta.label}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{heroDetails.trustLine}</p>
          </Reveal>
        </div>

        <HeroQuoteCard />
      </div>
    </section>
  );
}

export function ProofBand() {
  return (
    <section className="border-b border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <Reveal>
          <div className="grid gap-8 sm:grid-cols-3">
            {proofStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="tabular-mono font-heading text-3xl font-bold text-foreground sm:text-4xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Problem() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>Le problème</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
            {problemDetails.heading}
          </h2>
          <p className="mt-4 text-base text-muted-foreground">{problemDetails.subheading}</p>
        </Reveal>
        <Reveal className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
          {problemDetails.pains.map((pain) => (
            <RevealChild key={pain}>
              <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-sm font-semibold text-destructive">×</span>
                <span className="text-sm text-foreground">{pain}</span>
              </div>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Solution() {
  const icons = { FileText, PenLine, Receipt };
  return (
    <section id="fonctionnalites" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>La solution</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
            {solutionDetails.heading}
          </h2>
        </Reveal>
        <Reveal className="mt-10 grid gap-5 md:grid-cols-3">
          {solutionDetails.benefits.map((benefit) => {
            const Icon = icons[benefit.icon];
            return (
              <RevealChild key={benefit.title}>
                <div className="flex h-full flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <Stamp
                      label={benefit.stamp}
                      tone={benefit.stamp === 'PAYÉ' ? 'success' : benefit.stamp === 'SIGNÉ' ? 'success' : 'ink'}
                    />
                  </div>
                  <h3 className="font-heading text-xl font-bold tracking-normal text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              </RevealChild>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

export function Steps() {
  return (
    <section id="etapes" className="border-b border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>Comment ça marche</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
            {stepsDetails.heading}
          </h2>
        </Reveal>
        <Reveal className="mt-10 grid gap-5 md:grid-cols-3">
          {stepsDetails.steps.map((step, idx) => (
            <RevealChild key={step.title}>
              <div className="relative flex h-full flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
                <div className="flex items-center justify-between">
                  <span className="tabular-mono font-heading text-3xl font-bold text-primary/30">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <Stamp
                    label={step.stamp}
                    tone={step.stamp === 'PAYÉ' ? 'success' : step.stamp === 'LIEN' ? 'warning' : 'ink'}
                  />
                </div>
                <h3 className="font-heading text-xl font-bold tracking-normal text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
        <Reveal className="text-center">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
            Les questions qu’on nous pose
          </h2>
        </Reveal>
        <Reveal className="mt-10">
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-border first:border-t">
              <summary className="flex list-none cursor-pointer items-center justify-between gap-4 py-4 font-heading text-base font-semibold text-foreground select-none">
                <span>{faq.question}</span>
                <span className="text-xl font-normal text-muted-foreground group-open:hidden">+</span>
                <span className="hidden text-xl font-normal text-primary group-open:inline">−</span>
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="bg-primary py-16 text-center md:py-20">
      <div className="mx-auto max-w-2xl px-6">
        <Reveal>
          <h3 className="font-heading text-3xl font-extrabold leading-tight tracking-normal text-primary-foreground sm:text-4xl">
            {ctaDetails.heading}
          </h3>
          <p className="mx-auto mt-4 max-w-[44ch] text-sm leading-relaxed text-primary-foreground/90 sm:text-base">
            {ctaDetails.subheading}
          </p>
          <Button
            size="lg"
            asChild
            className="mt-8 h-12 border border-primary-foreground/30 bg-background px-8 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <Link href={ctaDetails.primaryCta.href}>{ctaDetails.primaryCta.label}</Link>
          </Button>
          <p className="mt-4 text-xs text-primary-foreground/80">
            {siteDetails.name} — {siteDetails.tagline}
          </p>
        </Reveal>
      </div>
    </section>
  );
}