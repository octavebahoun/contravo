import Link from 'next/link';
import type { ReactNode } from 'react';
import { FileText, PenLine, Receipt, ArrowRight, ShieldCheck, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Stamp, type StampTone } from '@/components/stamp';
import HeroQuoteCard from '@/components/hero-section-demo-1';
import { Reveal, RevealChild, HoverLift, CountUp, Disclosure, ScrollDrift } from './motion';
import {
  siteDetails,
  heroDetails,
  statusLine,
  problemDetails,
  solutionDetails,
  stepsDetails,
  proofDetails,
  pricingDetails,
  teamDetails,
  faqs,
  ctaDetails,
} from '../_data/content';

/**
 * Coquilles partagées.
 *
 * Chaque section répétait auparavant ses propres bordures, son propre rythme
 * vertical et sa propre chaîne de classes de titre — cinq copies littérales de
 * la même ligne. Une seule définition ici : changer le rythme de la page se
 * fait à un endroit, et deux sections ne peuvent plus diverger par accident.
 */

function Section({
  id,
  children,
  muted = false,
  className,
}: {
  id?: string;
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={[
        'scroll-mt-24 border-b border-border',
        muted ? 'bg-muted/40' : 'bg-background',
        className ?? '',
      ].join(' ')}
    >
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="block font-heading text-xs font-semibold uppercase tracking-[0.14em] text-primary">
      {children}
    </span>
  );
}

function SectionHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center" amount={0.4}>
      <RevealChild>
        <SectionLabel>{label}</SectionLabel>
      </RevealChild>
      <RevealChild>
        <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
          {title}
        </h2>
      </RevealChild>
      {description ? (
        <RevealChild>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>
        </RevealChild>
      ) : null}
    </Reveal>
  );
}

/** Carte de contenu — un seul traitement pour « solution » et « étapes ». */
function FeatureCard({
  lead,
  stamp,
  stampTone,
  title,
  description,
}: {
  lead: ReactNode;
  stamp: string;
  stampTone: StampTone;
  title: string;
  description: string;
}) {
  return (
    <HoverLift className="h-full">
      <div className="flex h-full flex-col gap-4 rounded-xl bg-card p-6 shadow-[0_1px_2px_rgb(33_22_15_/_0.06)] ring-1 ring-border transition-shadow duration-200 hover:shadow-[0_8px_24px_-12px_rgb(33_22_15_/_0.18)]">
        <div className="flex items-center justify-between">
          {lead}
          <Stamp label={stamp} tone={stampTone} />
        </div>
        <h3 className="font-heading text-xl font-bold tracking-normal text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </HoverLift>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 md:py-28 lg:grid-cols-2 lg:gap-16">
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
            <RevealChild>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" asChild className="h-11 px-6 text-sm font-semibold">
                  <Link href={heroDetails.primaryCta.href}>{heroDetails.primaryCta.label}</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="group h-11 bg-card px-6 text-sm font-medium"
                >
                  <Link href={heroDetails.secondaryCta.href}>
                    {heroDetails.secondaryCta.label}
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </RevealChild>
            <RevealChild>
              <p className="mt-4 text-xs text-muted-foreground">{heroDetails.trustLine}</p>
            </RevealChild>
          </Reveal>
        </div>

        <ScrollDrift distance={36}>
          <HeroQuoteCard />
        </ScrollDrift>
      </div>
    </section>
  );
}

/**
 * Ce qui a remplacé la bande de trois chiffres.
 *
 * « 3 documents créés par jour », « 4× plus vite encaissé » : aucun n'était
 * mesuré, et le premier lecteur curieux aurait demandé la source. Une phase de
 * test annoncée franchement tient mieux la question.
 */
export function StatusBand() {
  return (
    <section className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Reveal className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center" amount={0.4}>
          <RevealChild>
            <span className="text-sm font-medium text-foreground">{statusLine.text}</span>
          </RevealChild>
          <RevealChild>
            <span className="text-sm text-muted-foreground">{statusLine.detail}</span>
          </RevealChild>
        </Reveal>
      </div>
    </section>
  );
}

export function Problem() {
  return (
    <Section>
      <SectionHeading
        label="Le problème"
        title={problemDetails.heading}
        description={problemDetails.subheading}
      />
      <Reveal className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
        {problemDetails.pains.map((pain) => (
          <RevealChild key={pain} className="h-full">
            <HoverLift className="h-full">
              <div className="flex h-full items-center gap-3 rounded-xl bg-card p-5 ring-1 ring-border">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-destructive/10 font-mono text-sm font-semibold text-destructive"
                >
                  ×
                </span>
                <span className="text-sm text-foreground">{pain}</span>
              </div>
            </HoverLift>
          </RevealChild>
        ))}
      </Reveal>
    </Section>
  );
}

export function Solution() {
  const icons = { FileText, PenLine, Receipt };
  return (
    <Section id="fonctionnalites" muted>
      <SectionHeading label="La solution" title={solutionDetails.heading} />
      <Reveal className="mt-12 grid gap-5 md:grid-cols-3">
        {solutionDetails.benefits.map((benefit) => {
          const Icon = icons[benefit.icon];
          return (
            <RevealChild key={benefit.title} className="h-full">
              <FeatureCard
                lead={
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                }
                stamp={benefit.stamp}
                stampTone={benefit.stampTone}
                title={benefit.title}
                description={benefit.description}
              />
            </RevealChild>
          );
        })}
      </Reveal>
    </Section>
  );
}

export function Steps() {
  return (
    <Section id="etapes">
      <SectionHeading label="Comment ça marche" title={stepsDetails.heading} />
      <Reveal className="mt-12 grid gap-5 md:grid-cols-3">
        {stepsDetails.steps.map((step, idx) => (
          <RevealChild key={step.title} className="h-full">
            <FeatureCard
              lead={
                <span className="tabular-mono font-heading text-3xl font-bold text-primary/30">
                  {String(idx + 1).padStart(2, '0')}
                </span>
              }
              stamp={step.stamp}
              stampTone={step.stampTone}
              title={step.title}
              description={step.description}
            />
          </RevealChild>
        ))}
      </Reveal>
    </Section>
  );
}

/**
 * Le bloc « Preuve ».
 *
 * Placé juste après « Comment ça marche » : le lecteur vient de comprendre le
 * fonctionnement, la question suivante est « et si ça tourne mal ? ». C'est le
 * moment de répondre, pas trois sections plus bas.
 */
export function Proof() {
  return (
    <Section id="preuve">
      <div className="mx-auto max-w-3xl">
        <Reveal amount={0.4}>
          <RevealChild>
            <SectionLabel>{proofDetails.label}</SectionLabel>
          </RevealChild>
          <RevealChild>
            <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
              {proofDetails.heading}
            </h2>
          </RevealChild>
          <RevealChild>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {proofDetails.intro}
            </p>
          </RevealChild>
          <RevealChild>
            <p className="mt-4 border-l-2 border-primary pl-4 text-base font-medium leading-relaxed text-foreground">
              {proofDetails.lead}
            </p>
          </RevealChild>
        </Reveal>

        <Reveal className="mt-10 grid gap-4 sm:grid-cols-3">
          {proofDetails.points.map((point) => (
            <RevealChild key={point.title} className="h-full">
              <HoverLift className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border">
                  <ShieldCheck className="size-5 text-primary" aria-hidden />
                  <h3 className="font-heading text-base font-bold text-foreground">{point.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              </HoverLift>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

/**
 * Tarifs sans grille de prix.
 *
 * Voir `pricingDetails` : les montants existent dans le code de facturation
 * mais rien ne dit encore qu'ils sont les bons, et l'étude de marché en cours
 * pose exactement cette question.
 */
export function Pricing() {
  return (
    <Section id="tarifs" muted>
      <div className="mx-auto max-w-3xl text-center">
        <Reveal amount={0.4}>
          <RevealChild>
            <SectionLabel>{pricingDetails.label}</SectionLabel>
          </RevealChild>
          <RevealChild>
            <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
              {pricingDetails.heading}
            </h2>
          </RevealChild>
          <RevealChild>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {pricingDetails.body}
            </p>
          </RevealChild>
        </Reveal>

        <Reveal className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          {pricingDetails.points.map((point) => (
            <RevealChild key={point} className="h-full">
              <div className="flex h-full items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary"
                >
                  ✓
                </span>
                <span className="text-sm leading-relaxed text-foreground">{point}</span>
              </div>
            </RevealChild>
          ))}
        </Reveal>

        <Reveal className="mt-6">
          <RevealChild>
            <div className="rounded-xl border border-dashed border-border bg-background p-5 text-left">
              <h3 className="font-heading text-sm font-bold text-foreground">
                {pricingDetails.fees.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pricingDetails.fees.description}
              </p>
            </div>
          </RevealChild>
        </Reveal>
      </div>
    </Section>
  );
}

/** Qui est derrière — placé avant le CTA final, là où la confiance se décide. */
export function Team() {
  return (
    <Section id="equipe">
      <div className="mx-auto max-w-3xl">
        <Reveal amount={0.4}>
          <RevealChild>
            <SectionLabel>{teamDetails.label}</SectionLabel>
          </RevealChild>
          <RevealChild>
            <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-normal text-foreground sm:text-4xl">
              {teamDetails.heading}
            </h2>
          </RevealChild>
          <RevealChild>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {teamDetails.body}
            </p>
          </RevealChild>
        </Reveal>

        <Reveal className="mt-10 grid gap-4 sm:grid-cols-2">
          {teamDetails.members.map((member) => (
            <RevealChild key={member.name} className="h-full">
              <div className="flex h-full items-center gap-4 rounded-xl bg-card p-5 ring-1 ring-border">
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 font-heading text-sm font-bold text-primary"
                >
                  {member.name
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')}
                </span>
                <div>
                  <p className="font-heading text-sm font-bold text-foreground">{member.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{member.role}</p>
                </div>
              </div>
            </RevealChild>
          ))}
        </Reveal>

        <Reveal className="mt-8">
          <RevealChild>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
              <Link
                href={`mailto:${teamDetails.contact.email}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Mail className="size-4" aria-hidden />
                {teamDetails.contact.email}
              </Link>
              <span className="text-sm text-muted-foreground">{teamDetails.contact.note}</span>
            </div>
          </RevealChild>
        </Reveal>
      </div>
    </Section>
  );
}

export function FAQ() {
  return (
    <Section id="faq" muted>
      <div className="mx-auto max-w-3xl">
        <SectionHeading label="FAQ" title="Les questions qu’on nous pose" />
        <Reveal className="mt-12">
          {faqs.map((faq) => (
            <RevealChild key={faq.question}>
              <Disclosure question={faq.question} answer={faq.answer} />
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

export function CTA() {
  return (
    <section className="bg-primary py-20 text-center md:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <Reveal amount={0.4}>
          <RevealChild>
            <h3 className="font-heading text-3xl font-extrabold leading-tight tracking-normal text-primary-foreground sm:text-4xl">
              {ctaDetails.heading}
            </h3>
          </RevealChild>
          <RevealChild>
            <p className="mx-auto mt-4 max-w-[44ch] text-sm leading-relaxed text-primary-foreground/90 sm:text-base">
              {ctaDetails.subheading}
            </p>
          </RevealChild>
          <RevealChild>
            <Button
              size="lg"
              asChild
              className="mt-8 h-12 border border-primary-foreground/30 bg-background px-8 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Link href={ctaDetails.primaryCta.href}>{ctaDetails.primaryCta.label}</Link>
            </Button>
          </RevealChild>
          <RevealChild>
            <p className="mt-4 text-xs text-primary-foreground/80">
              {siteDetails.name} — {siteDetails.tagline}
            </p>
          </RevealChild>
        </Reveal>
      </div>
    </section>
  );
}
