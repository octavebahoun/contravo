import Link from 'next/link';
import {
  Check,
  FileText,
  PenLine,
  Receipt,
  ShieldCheck,
  Wallet,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  benefits,
  ctaDetails,
  heroDetails,
  pricing,
  stats,
  steps,
  testimonials,
  type Benefit,
} from '../_data/content';
import {
  HeroMockup,
  InvoiceMockup,
  PortalMockup,
  QuoteMockup,
  SignatureMockup,
} from './mockups';
import { HeroReveal, Reveal, RevealChild, fadeUpVariants } from './motion';
import { SquigglyText } from '@/components/ui/squiggly-text';
import { ThreeDMarquee } from '@/components/ui/3d-marquee';
import { PricingTable } from './pricing-table';

/**
 * Landing sections (structure and animation adapted from the Finwise template, MIT).
 *
 * Static content, so these stay server components; only the reveal wrappers in
 * `motion.tsx` cross into the client.
 */

const ICONS = {
  FileText,
  PenLine,
  Receipt,
  Workflow,
  ShieldCheck,
  Wallet,
} as const;

/** Mockup shown beside each highlighted benefit, in section order. */
const FEATURE_MOCKUPS = [QuoteMockup, SignatureMockup, InvoiceMockup, PortalMockup];

export function Hero() {
  return (
    <section id="hero" className="relative mx-auto max-w-7xl px-6 pb-16 pt-20 sm:pt-28">
      {/* Left border */}
      <div className="absolute inset-y-0 left-0 h-full w-px bg-border/40">
        <div className="absolute top-0 h-40 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
      </div>
      {/* Right border */}
      <div className="absolute inset-y-0 right-0 h-full w-px bg-border/40">
        <div className="absolute h-40 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
      </div>
      {/* Bottom border */}
      <div className="absolute inset-x-0 bottom-0 h-px w-full bg-border/40">
        <div className="absolute mx-auto h-px w-40 bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>

      {/* Grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_55%,transparent_100%)]"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-0 -z-10 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="mx-auto max-w-3xl text-center">
        <HeroReveal>
          <p className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            Devis · Contrats · Signature · Factures
          </p>
        </HeroReveal>

        <HeroReveal delay={0.08}>
          <h1 className="mt-6 text-4xl font-normal leading-tight tracking-tight text-foreground sm:text-6xl">
            <SquigglyText>{heroDetails.heading}</SquigglyText>
          </h1>
        </HeroReveal>

        <HeroReveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            {heroDetails.subheading}
          </p>
        </HeroReveal>

        <HeroReveal delay={0.24}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href={heroDetails.primaryCta.href}>{heroDetails.primaryCta.label}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={heroDetails.secondaryCta.href}>{heroDetails.secondaryCta.label}</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Sans carte bancaire · Votre premier devis en quelques minutes
          </p>
        </HeroReveal>

        <HeroReveal
          delay={0.4}
          className="relative z-10 mt-16 rounded-3xl border border-border bg-card p-4 shadow-md overflow-hidden max-w-7xl mx-auto"
        >
          <ThreeDMarquee
            images={[
              '/brutalist_quote_editor.png',
              '/brutalist_analytics.png',
              '/brutalist_documents.png',
              '/brutalist_signature.png',
              '/dashboard-preview.png',
              '/brutalist_quote_editor.png',
              '/brutalist_analytics.png',
              '/brutalist_documents.png',
              '/brutalist_signature.png',
              '/dashboard-preview.png',
              '/brutalist_quote_editor.png',
              '/brutalist_analytics.png',
              '/brutalist_documents.png',
              '/brutalist_signature.png',
              '/dashboard-preview.png',
              '/brutalist_quote_editor.png',
              '/brutalist_analytics.png',
              '/brutalist_documents.png',
              '/brutalist_signature.png',
              '/dashboard-preview.png',
            ]}
          />
        </HeroReveal>
      </div>
    </section>
  );
}

export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-normal tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/**
 * One benefit paired with its mockup, alternating sides down the page — the
 * layout the template used for its phone screenshots.
 */
function BenefitSection({
  benefit,
  mockup: Mockup,
  imageAtRight,
}: {
  benefit: Benefit;
  mockup: () => React.JSX.Element;
  imageAtRight: boolean;
}) {
  const Icon = ICONS[benefit.icon];

  return (
    <Reveal className="mb-20 flex flex-col items-center gap-10 lg:mb-28 lg:flex-row lg:gap-20">
      <div
        className={`w-full max-w-lg ${imageAtRight ? '' : 'lg:order-2'}`}
      >
        <RevealChild>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-6 w-6 text-primary" aria-hidden />
          </div>

          <h3 className="mt-5 text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
            {benefit.title}
          </h3>
          <p className="mt-3 leading-relaxed text-muted-foreground">{benefit.description}</p>
        </RevealChild>

        <div className="mt-6 space-y-4">
          {benefit.bullets.map((bullet) => (
            <RevealChild key={bullet}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </span>
                <p className="text-sm text-muted-foreground">{bullet}</p>
              </div>
            </RevealChild>
          ))}
        </div>
      </div>

      <div className={`flex w-full justify-center ${imageAtRight ? 'lg:order-2' : ''}`}>
        <Mockup />
      </div>
    </Reveal>
  );
}

/** Benefits without a mockup, shown as a compact grid below the paired ones. */
function BenefitCard({ benefit }: { benefit: Benefit }) {
  const Icon = ICONS[benefit.icon];

  return (
    <RevealChild className="h-full">
      <div className="h-full rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
        </div>

        <h3 className="mt-4 text-base font-semibold text-foreground">{benefit.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {benefit.description}
        </p>

        <ul className="mt-4 space-y-2">
          {benefit.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </RevealChild>
  );
}

export function Benefits() {
  const featured = benefits.slice(0, FEATURE_MOCKUPS.length);
  const rest = benefits.slice(FEATURE_MOCKUPS.length);

  return (
    <section id="fonctionnalites" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal variants={fadeUpVariants}>
          <SectionTitle
            title="Tout le cycle commercial, sans friction"
            description="Du premier devis au règlement de la facture, sans changer d'outil."
          />
        </Reveal>

        <div className="mt-16">
          {featured.map((benefit, i) => (
            <BenefitSection
              key={benefit.title}
              benefit={benefit}
              mockup={FEATURE_MOCKUPS[i]}
              imageAtRight={i % 2 === 0}
            />
          ))}
        </div>

        {rest.length > 0 ? (
          <Reveal className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((benefit) => (
              <BenefitCard key={benefit.title} benefit={benefit} />
            ))}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

export function Steps() {
  return (
    <section id="etapes" className="bg-secondary/40 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal variants={fadeUpVariants}>
          <SectionTitle
            title="Comment ça marche"
            description="Trois étapes, et vous êtes payé."
          />
        </Reveal>

        <Reveal className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <RevealChild key={step.number}>
              <span className="font-mono text-sm font-semibold text-primary">
                {step.number}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="tarifs" className="px-4 py-16 sm:px-6 sm:py-24 max-w-7xl mx-auto">
      <Reveal variants={fadeUpVariants}>
        <PricingTable />
      </Reveal>
    </section>
  );
}

/**
 * Rendered only once real quotes exist — an empty testimonials wall is more
 * honest than invented praise.
 */
export function Testimonials() {
  if (testimonials.length === 0) return null;

  return (
    <section id="temoignages" className="bg-secondary/40 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal variants={fadeUpVariants}>
          <SectionTitle title="Ils utilisent Contravo" />
        </Reveal>

        <Reveal className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((item) => (
            <RevealChild key={item.name} className="h-full">
              <figure className="h-full rounded-3xl border border-border bg-card p-6">
                <blockquote className="text-sm leading-relaxed text-muted-foreground">
                  « {item.quote} »
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="text-muted-foreground"> — {item.role}</span>
                </figcaption>
              </figure>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/** Same rule as testimonials: no numbers until there are real ones to show. */
export function Stats() {
  if (stats.length === 0) return null;

  return (
    <section className="px-4 py-16 sm:px-6">
      <Reveal className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">
        {stats.map((stat) => (
          <RevealChild key={stat.label}>
            <p className="text-3xl font-medium text-primary font-mono">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </RevealChild>
        ))}
      </Reveal>
    </section>
  );
}

export function CTA() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <Reveal variants={fadeUpVariants} className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-3xl bg-foreground px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-normal text-background sm:text-3xl">
            <SquigglyText>{ctaDetails.heading}</SquigglyText>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-background/70">{ctaDetails.subheading}</p>

          <Button size="lg" className="mt-7" asChild>
            <Link href={ctaDetails.primaryCta.href}>{ctaDetails.primaryCta.label}</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
