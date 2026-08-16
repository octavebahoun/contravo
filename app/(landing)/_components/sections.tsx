import Link from 'next/link';
import Image from 'next/image';
import { Fragment } from 'react';
import {
  Users,
  FolderKanban,
  FileText,
  ShieldCheck,
  Receipt,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThreeDMarquee } from '@/components/ui/3d-marquee';

function CornerDecoration() {
  return (
    <>
      <i className="corner-extend tl" />
      <i className="corner-extend tr" />
      <i className="corner-extend bl" />
      <i className="corner-extend br" />
    </>
  );
}

const marqueeImages = [
  '/brutalist_analytics.png',
  '/brutalist_documents.png',
  '/brutalist_quote_editor.png',
  '/brutalist_signature.png',
  '/brutalist_analytics.png',
  '/brutalist_analytics.png',
  '/brutalist_documents.png',
  '/brutalist_quote_editor.png',
  '/brutalist_signature.png',
  '/brutalist_analytics.png',
  '/brutalist_analytics.png',
  '/brutalist_documents.png',
];

export function Hero() {
  return (
    <section className="relative min-h-[620px] overflow-hidden border-b border-border bg-background flex items-center">
      {/* 3D Marquee cover backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Voile opaque vers transparent */}
        <div className="absolute inset-0 z-20 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 z-20 bg-gradient-to-b from-background via-transparent to-background" />
        <div className="absolute inset-y-0 right-0 left-0 md:left-1/3 z-10 flex items-center justify-center opacity-40 md:opacity-90">
          <ThreeDMarquee images={marqueeImages} className="w-full h-full scale-90 sm:scale-100" />
        </div>
      </div>

      <div className="relative z-30 mx-auto max-w-7xl px-6 py-20 w-full">
        <div className="max-w-xl md:max-w-2xl">
          <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
            01 · Pour freelances et agences
          </span>
          <hr className="border-border mb-6 w-20" />
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl tracking-tight text-foreground leading-tight">
            De la fiche client à l'avis signé. Une pile.
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-4 leading-relaxed">
            Contravo remreplace cinq outils : clients, projets, devis, contrats, factures, portail client. Signature électronique et paiement mobile money natifs.
          </p>
          <div className="flex gap-3 flex-wrap items-center mt-6">
            <Button size="sm" asChild className="rounded-none font-heading uppercase tracking-wider text-[11px] px-6">
              <Link href="/sign-up">Essayer 14 jours</Link>
            </Button>
            <Button size="sm" variant="ghost" asChild className="rounded-none font-heading uppercase tracking-wider text-[11px] px-6 border border-border">
              <Link href="/sign-in">Voir la démo →</Link>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-3 tracking-wide">
            Sans carte bancaire · Support FR
          </p>
        </div>
      </div>
    </section>
  );
}

export function LogosBand() {
  return (
    <section className="bg-foreground/5 border-y border-border py-6">
      <div className="mx-auto max-w-7xl px-6">
        <span className="block text-center font-heading font-semibold text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-4">
          Ils gèrent leur activité avec Contravo
        </span>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex-1 min-w-[100px] h-[20px] opacity-45" style={{ background: 'linear-gradient(90deg, var(--primary), transparent 80%)' }} />
          <div className="flex-1 min-w-[100px] h-[20px] opacity-45" style={{ background: 'linear-gradient(90deg, var(--foreground), transparent 75%)' }} />
          <div className="flex-1 min-w-[100px] h-[20px] opacity-45" style={{ background: 'linear-gradient(90deg, var(--primary) 0 40%, transparent 40% 60%, var(--primary) 60%)' }} />
          <div className="flex-1 min-w-[100px] h-[20px] opacity-45" style={{ background: 'repeating-linear-gradient(90deg, var(--foreground) 0 4px, transparent 4px 10px)' }} />
          <div className="flex-1 min-w-[100px] h-[20px] opacity-45" style={{ background: 'linear-gradient(90deg, transparent 0 30%, var(--primary) 30%)' }} />
        </div>
      </div>
    </section>
  );
}

export function BeforeAfter() {
  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        02 · Avant / Après
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="grid md:grid-cols-2 gap-10">
        <div>
          <h3 className="font-heading font-semibold text-base uppercase text-muted-foreground mb-4">
            Avant Contravo
          </h3>
          <ul className="space-y-3">
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-muted-foreground">
              <span className="font-heading font-semibold text-xs text-muted-foreground/60 w-4">×</span>
              <span>Devis dans Word</span>
            </li>
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-muted-foreground">
              <span className="font-heading font-semibold text-xs text-muted-foreground/60 w-4">×</span>
              <span>Contrats scannés à la main</span>
            </li>
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-muted-foreground">
              <span className="font-heading font-semibold text-xs text-muted-foreground/60 w-4">×</span>
              <span>Excel pour la rentabilité</span>
            </li>
            <li className="flex items-baseline gap-2 text-sm text-muted-foreground">
              <span className="font-heading font-semibold text-xs text-muted-foreground/60 w-4">×</span>
              <span>Relances impayés au feeling</span>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-heading font-semibold text-base uppercase text-foreground mb-4">
            Avec Contravo
          </h3>
          <ul className="space-y-3">
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-foreground">
              <span className="font-heading font-bold text-xs text-primary w-4">+</span>
              <span>Devis signés dans le portail</span>
            </li>
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-foreground">
              <span className="font-heading font-bold text-xs text-primary w-4">+</span>
              <span>Contrats signés + horodatés</span>
            </li>
            <li className="flex items-baseline gap-2 pb-2 border-b border-dashed border-border text-sm text-foreground">
              <span className="font-heading font-bold text-xs text-primary w-4">+</span>
              <span>Marge par projet, en direct</span>
            </li>
            <li className="flex items-baseline gap-2 text-sm text-foreground">
              <span className="font-heading font-bold text-xs text-primary w-4">+</span>
              <span>Relances automatiques J+7/14/30</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Features() {
  const list = [
    {
      title: 'Clients',
      description: 'Fiches, historique, contacts. Un client, tout un dossier.',
      icon: Users,
    },
    {
      title: 'Projets',
      description: 'Statuts, équipe, dates. Rentabilité par projet.',
      icon: FolderKanban,
    },
    {
      title: 'Devis',
      description: 'Templates, envoi, signature électronique.',
      icon: FileText,
    },
    {
      title: 'Contrats',
      description: "Preuve d'intégrité SHA-256, cachet signature.",
      icon: ShieldCheck,
    },
    {
      title: 'Factures',
      description: 'Numérotation stricte, relances, paiement en ligne.',
      icon: Receipt,
    },
    {
      title: 'Portail',
      description: 'Vos clients signent et payent sans compte.',
      icon: ExternalLink,
    },
  ];

  return (
    <section id="produit" className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        03 · Tout ce qu'il faut
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="blueprint-frame p-5 bg-card/30">
              <CornerDecoration />
              <Icon className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-heading font-semibold text-base uppercase text-foreground mb-1">
                {item.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProductPreview() {
  const previews = [
    {
      id: 'apercu-dashboard',
      label: 'Dashboard',
      src: '/brutalist_analytics.png',
    },
    {
      id: 'apercu-devis',
      label: 'Devis',
      src: '/brutalist_quote_editor.png',
    },
    {
      id: 'apercu-facture',
      label: 'Facture',
      src: '/brutalist_documents.png',
    },
  ];

  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        04 · Aperçu
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {previews.map((preview) => (
          <div key={preview.id} className="flex flex-col gap-2">
            <figure className="relative aspect-[3/4] blueprint-frame hatch overflow-hidden bg-card">
              <CornerDecoration />
              <Image
                src={preview.src}
                alt={preview.label}
                fill
                className="object-cover"
              />
            </figure>
            <figcaption className="text-center font-heading font-semibold text-[10px] tracking-wider uppercase text-muted-foreground">
              {preview.label}
            </figcaption>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Steps() {
  const stepsList = [
    { num: '01', title: 'Devis', sub: 'Créer & envoyer' },
    { num: '02', title: 'Signé', sub: 'Portail client' },
    { num: '03', title: 'Livré', sub: 'Livrables' },
    { num: '04', title: 'Payé', sub: 'GeniusPay' },
    { num: '05', title: 'Avis', sub: 'Vitrine' },
  ];

  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        05 · Comment ça marche
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        {stepsList.map((step, idx) => (
          <Fragment key={step.num}>
            <div className="flex-1">
              <div className="font-heading font-bold text-2xl text-primary/80 leading-none">
                {step.num}
              </div>
              <div className="font-heading font-semibold text-xs tracking-wider uppercase mt-1 text-foreground">
                {step.title}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {step.sub}
              </div>
            </div>
            {idx < stepsList.length - 1 && (
              <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground/60 shrink-0 self-center" />
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function PortailSplit() {
  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div>
          <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
            06 · Portail client
          </span>
          <hr className="border-border mb-4 w-20" />
          <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-foreground leading-tight mb-3">
            Vos clients sans compte.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-[48ch] leading-relaxed">
            Un lien magique par email. Ils consultent, signent, approuvent, payent — sans créer d'accès.
          </p>
        </div>
        <figure className="relative aspect-[4/3] blueprint-frame hatch overflow-hidden bg-card">
          <CornerDecoration />
          <Image
            src="/brutalist_documents.png"
            alt="Portail client"
            fill
            className="object-cover"
          />
        </figure>
      </div>
    </section>
  );
}

export function PaymentSplit() {
  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <figure className="relative aspect-[4/3] blueprint-frame hatch overflow-hidden bg-card order-2 md:order-1">
          <CornerDecoration />
          <Image
            src="/brutalist_signature.png"
            alt="GeniusPay Integration"
            fill
            className="object-cover"
          />
        </figure>
        <div className="order-1 md:order-2">
          <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
            07 · Paiement
          </span>
          <hr className="border-border mb-4 w-20" />
          <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-foreground leading-tight mb-3">
            Wave. Orange Money. Carte. En XOF.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-[48ch] leading-relaxed mb-4">
            GeniusPay branché nativement. Réconciliation auto : facture payée = facture close.
          </p>
          <div className="flex flex-wrap gap-3">
            {['Wave', 'Orange Money', 'Carte'].map((badge) => (
              <span key={badge} className="relative px-4 py-1.5 border border-primary text-primary-foreground font-heading font-semibold text-[10px] tracking-wider uppercase bg-primary/10">
                <i className="pay-badge-corner tl" />
                <i className="pay-badge-corner tr" />
                <i className="pay-badge-corner bl" />
                <i className="pay-badge-corner br" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Testimonials() {
  const list = [
    {
      quote: "« Devis signé le matin, acompte reçu à midi. »",
      author: "— A. Diarra, Studio graphique · Abidjan",
    },
    {
      quote: "« On a supprimé Notion, Word et un tableur. »",
      author: "— K. Adjovi, Agence dev · Cotonou",
    },
  ];

  return (
    <section className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        08 · Ils utilisent Contravo
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="grid md:grid-cols-2 gap-6">
        {list.map((item, idx) => (
          <div key={idx} className="blueprint-frame p-5 bg-card/30">
            <CornerDecoration />
            <blockquote className="font-heading font-medium text-lg tracking-normal text-foreground mb-3">
              {item.quote}
            </blockquote>
            <figcaption className="text-xs text-muted-foreground">
              {item.author}
            </figcaption>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '0',
      period: 'XOF',
      features: ['3 membres', '10 clients', '5 projets', 'Signature électronique'],
      cta: 'Commencer',
      highlighted: false,
      href: '/sign-up',
    },
    {
      name: 'Pro',
      price: '15 000',
      period: 'XOF/mois',
      features: ['15 membres', '200 clients', '100 projets', 'Relances automatiques', 'API + Webhooks'],
      cta: 'Essayer 14 jours',
      highlighted: true,
      href: '/sign-up',
    },
    {
      name: 'Business',
      price: '50 000',
      period: 'XOF/mois',
      features: ['Membres illimités', 'Clients illimités', 'Projets illimités', 'Support prioritaire', 'SLA 99,9%'],
      cta: 'Nous contacter',
      highlighted: false,
      href: 'mailto:contact@contravo.com',
    },
  ];

  return (
    <section id="tarifs" className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        09 · Tarifs
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="grid lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`blueprint-frame p-5 flex flex-col gap-4 ${
              plan.highlighted ? 'border-primary bg-primary/5' : 'bg-card/30'
            }`}
          >
            <CornerDecoration />
            <div className="font-heading font-bold text-xs tracking-widest uppercase text-muted-foreground flex items-center gap-1">
              {plan.name} {plan.highlighted && <span className="text-primary text-[10px]">★</span>}
            </div>
            <div className="font-heading font-bold text-2xl text-foreground flex items-baseline gap-1">
              {plan.price} <span className="font-sans font-normal text-[10px] uppercase tracking-wider text-muted-foreground">{plan.period}</span>
            </div>
            <ul className="space-y-2 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-baseline gap-2 pb-1.5 border-b border-dashed border-border text-xs text-foreground">
                  <span className="text-primary font-heading font-bold">+</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              variant={plan.highlighted ? 'default' : 'outline'}
              asChild
              className="w-full rounded-none font-heading uppercase text-[10px] tracking-wider h-9"
            >
              <Link href={plan.href}>{plan.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FAQ() {
  const faqs = [
    {
      q: 'La signature a-t-elle valeur juridique ?',
      a: 'Oui. Contravo horodate chaque signature et calcule une empreinte SHA-256 du contrat au moment de la signature. Le fichier signé, son horodatage et son empreinte forment un faisceau de preuves recevable en OHADA et en droit français.',
    },
    {
      q: 'Comment fonctionne GeniusPay ?',
      a: 'GeniusPay est branché nativement à vos factures. Vos clients règlent en Wave, Orange Money ou carte bancaire, en XOF. Chaque paiement reçu clôture automatiquement la facture correspondante — aucune saisie manuelle.',
    },
    {
      q: 'Mes données restent-elles isolées ?',
      a: 'Chaque organisation vit dans son propre espace. Un filtre organization_id obligatoire côté application, doublé de Row-Level Security PostgreSQL, garantit qu\'aucune requête ne peut lire ou écrire les données d\'une autre org — même en cas d\'erreur d\'un développeur.',
    },
    {
      q: 'Puis-je exporter mes données ?',
      a: 'Oui, à tout moment. Export CSV ou JSON de vos clients, projets, devis, factures et contrats depuis les paramètres de l\'organisation. Un export complet RGPD est disponible sur simple demande.',
    },
    {
      q: 'Y a-t-il une API ?',
      a: 'Oui. Une API REST versionnée (/api/v1), authentifiée par API key ou session, avec pagination cursor, idempotence, webhooks signés HMAC, et documentation OpenAPI générée automatiquement.',
    },
  ];

  return (
    <section id="docs" className="py-12 mx-auto max-w-7xl px-6">
      <span className="block font-heading font-semibold text-xs tracking-wider uppercase text-primary mb-2">
        10 · FAQ
      </span>
      <hr className="border-border mb-6 w-20" />
      <div className="max-w-3xl mx-auto">
        {faqs.map((faq, idx) => (
          <details key={idx} className="group border-b border-border first:border-t">
            <summary className="flex list-none items-center justify-between py-4 cursor-pointer font-heading font-semibold text-sm sm:text-base uppercase tracking-wider text-foreground select-none">
              <span>{faq.q}</span>
              <span className="text-xl font-normal text-muted-foreground group-open:hidden">+</span>
              <span className="text-xl font-normal text-primary hidden group-open:inline">−</span>
            </summary>
            <p className="pb-4 text-xs sm:text-sm leading-relaxed text-muted-foreground max-w-[68ch]">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="bg-primary/5 border-y border-border py-12 text-center">
      <div className="mx-auto max-w-7xl px-6">
        <h3 className="font-heading font-semibold text-xl sm:text-2xl uppercase text-foreground">
          Commencez aujourd'hui.
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2">
          14 jours, sans carte bancaire.
        </p>
        <Button size="sm" asChild className="mt-4 rounded-none font-heading uppercase tracking-wider text-[10px] px-6 h-9">
          <Link href="/sign-up">Créer mon compte</Link>
        </Button>
      </div>
    </section>
  );
}
