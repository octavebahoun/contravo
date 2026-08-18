'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { completeOnboarding, skipOnboarding, type SetupInput } from '../actions';

/**
 * First-run setup, one question per screen.
 *
 * The shape is deliberate: a single long form would be skipped wholesale, and
 * everything asked here ends up printed on a document a client reads. Splitting
 * it means each answer arrives with its own reason visible next to it.
 *
 * Nothing is mandatory beyond a name. The flow can be abandoned at any point —
 * a setup wall in front of a product nobody has decided to use yet only costs
 * signups — and every field stays editable under Paramètres › Général.
 */

/**
 * Zero-decimal currencies come first because that is the market this is built
 * for: the CFA franc has no subunit, which the whole money layer depends on
 * (`lib/money.ts`).
 */
const CURRENCIES = [
  { code: 'XOF', label: 'Franc CFA — UEMOA', hint: "Côte d'Ivoire, Sénégal, Bénin, Burkina, Mali, Togo, Niger" },
  { code: 'XAF', label: 'Franc CFA — CEMAC', hint: 'Cameroun, Gabon, Tchad, Congo, Centrafrique' },
  { code: 'GNF', label: 'Franc guinéen', hint: 'Guinée' },
  { code: 'EUR', label: 'Euro', hint: 'Zone euro' },
  { code: 'USD', label: 'Dollar américain', hint: 'International' },
];

const ACTIVITIES = [
  'Agence digitale',
  'Studio de design',
  'Développeur indépendant',
  'Conseil',
  'Autre',
];

type StepId = 'name' | 'org' | 'currency' | 'legal' | 'bank' | 'done';

const STEPS: StepId[] = ['name', 'org', 'currency', 'legal', 'bank', 'done'];

const EMPTY: SetupInput = {
  fullName: '',
  organizationName: '',
  activity: '',
  currency: 'XOF',
  legalForm: '',
  address: '',
  registration: '',
  taxId: '',
  phone: '',
  contactEmail: '',
  bankName: '',
  accountHolder: '',
  iban: '',
  mobileMoney: '',
};

export function OnboardingFlow({
  defaultFullName,
  defaultOrganizationName,
  contactEmail,
}: {
  defaultFullName: string;
  defaultOrganizationName: string;
  contactEmail: string;
}) {
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<SetupInput>({
    ...EMPTY,
    fullName: defaultFullName,
    // The placeholder sign-up invents (`"<login>'s Organization"`) is never
    // pre-filled: it is exactly what this screen exists to replace, and showing
    // it invites the reader to press Enter and keep it.
    organizationName: '',
    contactEmail,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[index];
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [index]);

  const set = (patch: Partial<SetupInput>) => setData((d) => ({ ...d, ...patch }));

  const canAdvance =
    step === 'name' ? data.fullName.trim().length > 0
    : step === 'org' ? data.organizationName.trim().length > 0
    : true;

  const next = () => {
    if (!canAdvance) return;
    setError(null);
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  const finish = () => {
    startTransition(async () => {
      const result = await completeOnboarding(data);
      if (result?.error) setError(result.error);
    });
  };

  const skip = () => startTransition(async () => { await skipOnboarding(); });

  // Enter advances, exactly like the rest of the flow's keyboard path. Shift is
  // free for multi-line fields, and the last step submits instead.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (step === 'done') finish();
    else next();
  };

  return (
    <div className="min-h-svh flex flex-col bg-background" onKeyDown={onKeyDown}>
      <Progress index={index} total={STEPS.length} />

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          {step === 'name' && (
            <Question
              title="Comment vous appelez-vous ?"
              hint="Ce nom apparaît dans votre espace et sur les documents que vous envoyez."
            >
              <Field
                ref={firstFieldRef}
                value={data.fullName}
                onChange={(v) => set({ fullName: v })}
                placeholder="Fatou Diarra"
                autoComplete="name"
              />
            </Question>
          )}

          {step === 'org' && (
            <Question
              title="Le nom de votre structure"
              hint="Il s'affiche en tête de chaque devis, contrat et facture."
            >
              <Field
                ref={firstFieldRef}
                value={data.organizationName}
                onChange={(v) => set({ organizationName: v })}
                placeholder="Studio Baobab"
                autoComplete="organization"
              />
              <div className="mt-6 flex flex-wrap gap-2">
                {ACTIVITIES.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    selected={data.activity === a}
                    onClick={() => set({ activity: data.activity === a ? '' : a })}
                  />
                ))}
              </div>
            </Question>
          )}

          {step === 'currency' && (
            <Question
              title="Dans quelle monnaie facturez-vous ?"
              hint="Elle détermine l'affichage des montants et la façon dont ils sont encaissés."
            >
              <div className="space-y-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => set({ currency: c.code })}
                    className={[
                      'w-full text-left rounded-lg border px-4 py-3 transition-colors',
                      data.currency === c.code
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/40',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{c.label}</div>
                        <div className="text-xs text-muted-foreground">{c.hint}</div>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Question>
          )}

          {step === 'legal' && (
            <Question
              title="Vos mentions légales"
              hint="Elles forment le pied de page de vos documents. Laissez vide ce qui ne s'applique pas."
              optional
            >
              <div className="space-y-3">
                <Field ref={firstFieldRef} value={data.legalForm} onChange={(v) => set({ legalForm: v })} placeholder="Forme juridique — SARL, SAS…" />
                <Field value={data.address} onChange={(v) => set({ address: v })} placeholder="Adresse — Cocody Riviera Golf, Abidjan" />
                <div className="grid grid-cols-2 gap-3">
                  <Field value={data.registration} onChange={(v) => set({ registration: v })} placeholder="RCCM" />
                  <Field value={data.taxId} onChange={(v) => set({ taxId: v })} placeholder="NCC / N° fiscal" />
                </div>
                <Field value={data.phone} onChange={(v) => set({ phone: v })} placeholder="Téléphone — +225 27 22 45 18 90" />
                {/* Pre-filled from the account, but shown: it is printed on every
                    document, and an address the reader never saw has no business
                    appearing at the bottom of their invoices. */}
                <Field value={data.contactEmail} onChange={(v) => set({ contactEmail: v })} placeholder="Email de contact" />
              </div>
            </Question>
          )}

          {step === 'bank' && (
            <Question
              title="Comment vos clients vous paient"
              hint="Ces coordonnées s'impriment au bas de vos factures. Sans elles, un client qui veut payer doit vous écrire."
              optional
            >
              <div className="space-y-3">
                <Field ref={firstFieldRef} value={data.bankName} onChange={(v) => set({ bankName: v })} placeholder="Banque — Ecobank Côte d'Ivoire" />
                <Field value={data.accountHolder} onChange={(v) => set({ accountHolder: v })} placeholder="Titulaire du compte" />
                <Field value={data.iban} onChange={(v) => set({ iban: v })} placeholder="IBAN" />
                <Field value={data.mobileMoney} onChange={(v) => set({ mobileMoney: v })} placeholder="Mobile Money — +225 07 00 12 34 56 (Wave, Orange Money)" />
              </div>
            </Question>
          )}

          {step === 'done' && <Recap data={data} />}

          {error && (
            <p className="mt-6 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-10 flex items-center gap-3">
            {index > 0 && (
              <Button type="button" variant="ghost" onClick={back} disabled={pending}>
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Button>
            )}

            <div className="flex-1" />

            {step !== 'done' ? (
              <Button type="button" onClick={next} disabled={!canAdvance || pending}>
                Continuer
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={finish} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Entrer dans Contravo
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={skip}
            disabled={pending}
            className="mt-8 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Passer cette configuration
          </button>
        </div>
      </div>
    </div>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex gap-1.5 px-6 pt-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            'h-1 flex-1 rounded-full transition-colors duration-300',
            i <= index ? 'bg-primary' : 'bg-border',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

function Question({
  title,
  hint,
  optional,
  children,
}: {
  title: string;
  hint: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground text-balance">
        {title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground text-pretty">
        {hint}
        {optional && <span className="ml-1 text-muted-foreground/70">(facultatif)</span>}
      </p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Borderless, oversized input — the question is the interface, not the box. */
const Field = function Field({
  ref,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <Input
      ref={ref}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="h-12 text-base"
    />
  );
};

/** Single-choice pill. Optional by design — the answer only colours a label. */
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3.5 py-1.5 text-xs transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-muted-foreground/40',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function Recap({ data }: { data: SetupInput }) {
  const rows: Array<[string, string | undefined]> = [
    ['Vous', data.fullName],
    ['Structure', data.organizationName],
    ['Activité', data.activity || undefined],
    ['Monnaie', data.currency],
    ['Mentions légales', [data.legalForm, data.address, data.registration && `RCCM ${data.registration}`, data.taxId && `NCC ${data.taxId}`, data.phone].filter(Boolean).join(' · ') || undefined],
    ['Paiement', [data.bankName, data.iban, data.mobileMoney].filter(Boolean).join(' · ') || undefined],
  ];

  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
        Tout est prêt.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground text-pretty">
        Vos documents partiront avec ces informations. Elles restent modifiables à tout moment
        dans Paramètres › Général.
      </p>

      <dl className="mt-8 divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-4 px-4 py-3">
            <dt className="w-36 shrink-0 text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground break-words">
              {value || <span className="text-muted-foreground/60">non renseigné</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
