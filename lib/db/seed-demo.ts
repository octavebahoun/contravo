/**
 * The demo dataset filmed in the presentation video.
 *
 * This is not a test fixture: every row is meant to be looked at on screen, so
 * the numbers add up, the dates are consistent with each other, and the names
 * are plausible for the market Contravo targets (Abidjan / Cotonou, XOF, Mobile
 * Money). One agency — Studio Baobab — with four clients whose files sit at four
 * different points of the lifecycle, so a single pass through the app shows the
 * whole chain without ever needing a "imagine that…".
 *
 * All dates are **relative to the day the seed runs**. Hard-coded dates would
 * make the overdue invoice two months late by the time filming happens, and the
 * dunning ladder would jump straight to its last rung.
 *
 * Amounts are whole XOF (see `lib/money.ts`): a `*_cents` column on a business
 * document holds francs, not hundredths.
 *
 *   npx tsx lib/db/seed-demo.ts
 *
 * Re-runnable: the demo organization is torn down first. Only that slug is
 * touched — anything else in the database is left alone.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, raw } from './drizzle';
import {
  users,
  organizations,
  memberships,
  clients as clientsTable,
  projects,
  projectMembers,
  quotes,
  quoteItems,
  contracts,
  invoices,
  invoiceItems,
  invoicePayments,
  invoiceReminders,
  expenses,
  deliverables,
  reviewRequests,
  reviews,
  documentSequences,
  paymentGatewayCredentials,
  subscriptions,
  storageUsage,
  apiKeys,
  webhookEndpoints,
  webhookDeliveries,
} from './schema';
import { hashPassword } from '../auth/session';
import { encryptSecret } from '../payments/credentials.service';
import { hashSecret } from '../api-keys';
import crypto from 'crypto';

const ORG_SLUG = 'studio-baobab';
const ORG_NAME = 'Studio Baobab';

/** The account that owns the demo org. Its password is left untouched. */
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? 'octavebahoun@gmail.com';

/**
 * Address used for the hero client. Filming the email + portal scenes means the
 * message has to actually land somewhere readable, so this defaults to a Gmail
 * plus-address on the owner's mailbox rather than to the fictional company
 * domain. Override it if you film with a different inbox.
 */
const HERO_CLIENT_EMAIL = process.env.DEMO_CLIENT_EMAIL ?? 'octavebahoun+pharmacie@gmail.com';

/** Shared password for the two seeded teammates — they only exist for the shot. */
const TEAM_PASSWORD = process.env.DEMO_TEAM_PASSWORD ?? 'Baobab2026!';

const XOF = (francs: number) => BigInt(francs);
const TVA_CI = 1800; // 18 %, taux normal en Côte d'Ivoire

const NOW = new Date();

/** `day(-28)` → the ISO date 28 days ago, for `date` columns. */
function day(offsetDays: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** `at(-20, 14)` → a timestamp 20 days ago at 14:00 local, for `timestamp` columns. */
function at(offsetDays: number, hour = 10): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, (offsetDays * 7) % 60, 0, 0);
  return d;
}

/**
 * Tables that hold demo rows, children before parents.
 *
 * `invoice_payments → invoices` and `signatures → files` are RESTRICT, so the
 * order matters: cascading from `organizations` would abort instead of cleaning
 * up. Everything here is scoped by `organization_id`, which is why the teardown
 * cannot touch another tenant's data.
 */
const TEARDOWN_ORDER = [
  'reviews',
  'review_requests',
  'invoice_reminders',
  'invoice_payments',
  'payment_intents',
  'invoice_items',
  'invoices',
  'contracts',
  'quote_items',
  'quotes',
  'deliverables',
  'expenses',
  'project_members',
  'projects',
  'clients',
  'document_sequences',
  'subscription_payment_attempts',
  'subscription_cycles',
  'subscriptions',
  'quota_period_usage',
  'quota_usage',
  'storage_usage',
  'payment_gateway_credentials',
  'payment_webhook_events',
  'webhook_endpoints',
  'public_tokens',
  'api_keys',
  'signatures',
  'files',
  'audit_logs',
  'invitations',
  'memberships',
];

async function teardown(organizationId: string): Promise<void> {
  // `webhook_deliveries` is the one table with no `organization_id` of its own —
  // it is reached through its endpoint — so it needs its own statement, before
  // the endpoints it points at.
  await raw(
    `delete from webhook_deliveries
      where endpoint_id in (
        select id from webhook_endpoints where organization_id = $1
      )`,
    [organizationId]
  );

  for (const table of TEARDOWN_ORDER) {
    await raw(`delete from "${table}" where organization_id = $1`, [organizationId]);
  }
  await raw('delete from organizations where id = $1', [organizationId]);
}

/** Finds the account by email, creating it only if it is missing. */
async function ensureUser(email: string, fullName: string, password: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: NOW,
    })
    .returning();
  return created;
}

async function main() {
  // --- Comptes ---------------------------------------------------------------

  const owner = await db.query.users.findFirst({ where: eq(users.email, OWNER_EMAIL) });
  if (!owner) {
    throw new Error(
      `Compte propriétaire introuvable : ${OWNER_EMAIL}.\n` +
        `Créez-le via /sign-up, ou passez DEMO_OWNER_EMAIL=<votre email>.`
    );
  }

  const fatou = await ensureUser('fatou.diarra@studiobaobab.ci', 'Fatou Diarra', TEAM_PASSWORD);
  const yao = await ensureUser('yao.kouassi@studiobaobab.ci', 'Yao Kouassi', TEAM_PASSWORD);

  // --- Organisation ----------------------------------------------------------

  const previous = await db.query.organizations.findFirst({
    where: eq(organizations.slug, ORG_SLUG),
  });
  if (previous) {
    await teardown(previous.id);
    console.log(`· ancienne organisation « ${ORG_NAME} » supprimée`);
  }

  const [org] = await db
    .insert(organizations)
    .values({
      slug: ORG_SLUG,
      name: ORG_NAME,
      defaultCurrency: 'XOF',
      plan: 'pro',
      planName: 'Pro',
      subscriptionStatus: 'active',
      legalMentions:
        'Studio Baobab SARL — Cocody Riviera Golf, Abidjan, Côte d’Ivoire — ' +
        'RCCM CI-ABJ-2024-B-14208 — NCC 2402518 F — contact@studiobaobab.ci — +225 27 22 45 18 90',
      bankDetails: {
        Banque: 'Ecobank Côte d’Ivoire',
        Titulaire: 'Studio Baobab SARL',
        IBAN: 'CI93 CI16 0010 0100 0123 4567 8901',
        'Mobile Money': '+225 07 00 12 34 56 (Wave / Orange Money)',
      },
      createdAt: at(-190, 9),
    })
    .returning();

  await db.insert(memberships).values([
    { organizationId: org.id, userId: owner.id, role: 'owner', joinedAt: at(-190, 9) },
    { organizationId: org.id, userId: fatou.id, role: 'admin', joinedAt: at(-165, 11) },
    { organizationId: org.id, userId: yao.id, role: 'member', joinedAt: at(-92, 15) },
  ]);

  // Pro rather than free: nothing should hit a quota wall in the middle of a take.
  const periodEnd = new Date(NOW);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await db.insert(subscriptions).values({
    organizationId: org.id,
    planId: 'pro',
    status: 'active',
    currentPeriodStart: at(-12, 8),
    currentPeriodEnd: periodEnd,
  });

  // --- Passerelle de paiement ------------------------------------------------

  // The Mobile Money scene needs live sandbox credentials on this org. They are
  // re-encrypted from `.env` rather than carried in the seed, so nothing secret
  // ends up in git.
  const gatewayKey = process.env.GENIUS_SANDBOX_API_KEY;
  const gatewaySecret = process.env.GENIUS_SANDBOX_SECRET_KEY;
  const gatewayWebhookSecret = process.env.GENIUS_SANDBOX_WEBHOOK_SECRET;

  if (gatewayKey && gatewaySecret && gatewayWebhookSecret) {
    const secret = encryptSecret(gatewaySecret);
    const webhook = encryptSecret(gatewayWebhookSecret);
    await db.insert(paymentGatewayCredentials).values({
      organizationId: org.id,
      provider: 'geniuspay',
      environment: 'sandbox',
      apiKeyPublic: gatewayKey,
      apiSecretEncrypted: secret.encrypted,
      apiSecretNonce: secret.nonce,
      webhookSecretEncrypted: webhook.encrypted,
      webhookSecretNonce: webhook.nonce,
      businessName: ORG_NAME,
      status: 'active',
      lastVerifiedAt: at(-12, 8),
      createdBy: owner.id,
    });
    console.log('· GeniusPay sandbox rattaché à l’organisation');
  } else {
    console.warn(
      '· GENIUS_SANDBOX_* absent de .env — le paiement Mobile Money ne sera pas filmable'
    );
  }

  // --- Clients ---------------------------------------------------------------

  const [pharmacie, woro, aissata, fondation] = await db
    .insert(clientsTable)
    .values([
      {
        organizationId: org.id,
        type: 'company',
        displayName: 'Pharmacie du Plateau',
        companyName: 'Pharmacie du Plateau SARL',
        email: HERO_CLIENT_EMAIL,
        phone: '+225 27 20 31 45 78',
        vatNumber: 'CI-2201847-K',
        billingAddress: {
          line1: 'Avenue Chardy, Immeuble Alpha 2000',
          line2: '3ᵉ étage',
          postalCode: '01 BP 4127',
          city: 'Abidjan Plateau',
          country: 'Côte d’Ivoire',
        },
        notes:
          'Dr. Kouadio N’Guessan, gérant. Interlocuteur réactif, valide par WhatsApp puis confirme par mail.',
        tags: ['santé', 'récurrent'],
        createdBy: owner.id,
        createdAt: at(-71, 10),
      },
      {
        organizationId: org.id,
        type: 'company',
        displayName: 'Wôrô Cosmétiques',
        companyName: 'Wôrô Cosmétiques SA',
        email: 'direction@woro-cosmetiques.bj',
        phone: '+229 21 30 44 12',
        vatNumber: 'BJ-3310092-W',
        billingAddress: {
          line1: 'Carré 1284, Quartier Gbedjromédé',
          postalCode: '08 BP 0912',
          city: 'Cotonou',
          country: 'Bénin',
        },
        notes: 'Marque de cosmétiques au beurre de karité. Exporte vers le Togo et le Nigeria.',
        tags: ['retail', 'export'],
        createdBy: owner.id,
        createdAt: at(-128, 14),
      },
      {
        organizationId: org.id,
        type: 'individual',
        displayName: 'Aïssata Traoré',
        firstName: 'Aïssata',
        lastName: 'Traoré',
        email: 'aissata.traore@cabinet-at.ci',
        phone: '+225 07 08 55 21 33',
        billingAddress: {
          line1: 'Rue des Jardins, Résidence Bimbresso',
          city: 'Abidjan Deux-Plateaux',
          country: 'Côte d’Ivoire',
        },
        notes: 'Consultante RH indépendante. Pas de TVA — franchise.',
        tags: ['freelance'],
        createdBy: fatou.id,
        createdAt: at(-34, 16),
      },
      {
        organizationId: org.id,
        type: 'company',
        displayName: 'Fondation Ivoire Éducation',
        companyName: 'Fondation Ivoire Éducation',
        email: 'projets@fondation-ivoire-education.org',
        phone: '+225 27 22 41 09 66',
        billingAddress: {
          line1: 'Boulevard Latrille, Villa 12',
          postalCode: '06 BP 1180',
          city: 'Abidjan Cocody',
          country: 'Côte d’Ivoire',
        },
        notes: 'Appel d’offres remporté en juin. Paiement par tranches, validation du conseil requise.',
        tags: ['ONG', 'appel d’offres'],
        createdBy: owner.id,
        createdAt: at(-19, 11),
      },
    ])
    .returning();

  // --- Projets ---------------------------------------------------------------

  const [refonte, packaging, vitrine, elearning] = await db
    .insert(projects)
    .values([
      {
        organizationId: org.id,
        clientId: pharmacie.id,
        code: 'PRJ-2026-001',
        name: 'Refonte du site et vente en ligne',
        description:
          'Refonte complète du site de la pharmacie avec catalogue, ordonnance en ligne et ' +
          'paiement Mobile Money. Livraison en trois lots : catalogue, commande, paiement.',
        status: 'active',
        startDate: day(-63),
        dueDate: day(44),
        budgetCents: XOF(5_310_000),
        currency: 'XOF',
        ownerUserId: owner.id,
        createdBy: owner.id,
        createdAt: at(-68, 9),
      },
      {
        organizationId: org.id,
        clientId: woro.id,
        code: 'PRJ-2026-002',
        name: 'Identité visuelle et packaging',
        description:
          'Logo, charte, déclinaison sur six références de packaging et gabarits pour l’imprimeur.',
        status: 'delivered',
        startDate: day(-120),
        dueDate: day(-14),
        deliveredAt: at(-12, 17),
        budgetCents: XOF(2_832_000),
        currency: 'XOF',
        ownerUserId: fatou.id,
        createdBy: fatou.id,
        createdAt: at(-124, 10),
      },
      {
        organizationId: org.id,
        clientId: aissata.id,
        code: 'PRJ-2026-003',
        name: 'Site vitrine cabinet RH',
        description: 'Site vitrine cinq pages, prise de rendez-vous et blog.',
        status: 'active',
        startDate: day(-16),
        dueDate: day(30),
        budgetCents: XOF(850_000),
        currency: 'XOF',
        ownerUserId: yao.id,
        createdBy: fatou.id,
        createdAt: at(-30, 15),
      },
      {
        organizationId: org.id,
        clientId: fondation.id,
        code: 'PRJ-2026-004',
        name: 'Plateforme e-learning',
        description:
          'Plateforme de cours en ligne pour les enseignants du primaire : parcours, quiz, ' +
          'suivi de progression, mode hors-ligne.',
        status: 'draft',
        startDate: day(14),
        dueDate: day(165),
        budgetCents: XOF(7_316_000),
        currency: 'XOF',
        ownerUserId: owner.id,
        createdBy: owner.id,
        createdAt: at(-17, 9),
      },
    ])
    .returning();

  await db.insert(projectMembers).values([
    { organizationId: org.id, projectId: refonte.id, userId: owner.id, role: 'lead', addedAt: at(-68, 9) },
    { organizationId: org.id, projectId: refonte.id, userId: yao.id, role: 'contributor', addedAt: at(-60, 11) },
    { organizationId: org.id, projectId: packaging.id, userId: fatou.id, role: 'lead', addedAt: at(-124, 10) },
    { organizationId: org.id, projectId: vitrine.id, userId: yao.id, role: 'lead', addedAt: at(-30, 15) },
  ]);

  // --- Devis -----------------------------------------------------------------

  const [devisRefonte, devisPackaging, devisVitrine, devisElearning] = await db
    .insert(quotes)
    .values([
      {
        organizationId: org.id,
        projectId: refonte.id,
        clientId: pharmacie.id,
        number: 'DEV-2026-0001',
        status: 'accepted',
        currency: 'XOF',
        subtotalCents: XOF(4_500_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(810_000),
        totalCents: XOF(5_310_000),
        validUntil: day(-33),
        notes: 'Hébergement et nom de domaine non inclus, refacturés au réel.',
        terms: 'Acompte de 40 % à la signature, solde à la livraison du lot 3. Paiement à 30 jours.',
        sentAt: at(-66, 11),
        viewedAt: at(-66, 14),
        acceptedAt: at(-64, 9),
        acceptedByName: 'Dr. Kouadio N’Guessan',
        acceptedByEmail: HERO_CLIENT_EMAIL,
        createdBy: owner.id,
        createdAt: at(-67, 16),
      },
      {
        organizationId: org.id,
        projectId: packaging.id,
        clientId: woro.id,
        number: 'DEV-2026-0002',
        status: 'accepted',
        currency: 'XOF',
        subtotalCents: XOF(2_400_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(432_000),
        totalCents: XOF(2_832_000),
        validUntil: day(-90),
        terms: 'Facturation à la livraison. Deux tours de correction inclus.',
        sentAt: at(-122, 10),
        viewedAt: at(-122, 12),
        acceptedAt: at(-121, 8),
        acceptedByName: 'Grâce Wôrô Adjovi',
        acceptedByEmail: 'direction@woro-cosmetiques.bj',
        createdBy: fatou.id,
        createdAt: at(-123, 15),
      },
      {
        // Left at `draft`: the video clicks « Envoyer » on this quote, and that
        // button only exists while it is still a draft. Sending it is what mints
        // the portal token the next scene opens.
        organizationId: org.id,
        projectId: vitrine.id,
        clientId: aissata.id,
        number: 'DEV-2026-0003',
        status: 'draft',
        currency: 'XOF',
        subtotalCents: XOF(850_000),
        taxRateBps: 0,
        taxCents: XOF(0),
        totalCents: XOF(850_000),
        validUntil: day(21),
        notes: 'Cliente en franchise de TVA — pas de taxe appliquée.',
        terms: 'Acompte de 50 % au démarrage. Livraison sous six semaines.',
        createdBy: fatou.id,
        createdAt: at(-10, 17),
      },
      {
        organizationId: org.id,
        projectId: elearning.id,
        clientId: fondation.id,
        number: 'DEV-2026-0004',
        status: 'draft',
        currency: 'XOF',
        subtotalCents: XOF(6_200_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(1_116_000),
        totalCents: XOF(7_316_000),
        validUntil: day(45),
        terms: 'Paiement en trois tranches : 30 % / 40 % / 30 %.',
        createdBy: owner.id,
        createdAt: at(-15, 11),
      },
    ])
    .returning();

  await db.insert(quoteItems).values([
    // DEV-2026-0001 — 750 000 + 1 200 000 + 2 100 000 + 450 000 = 4 500 000
    { organizationId: org.id, quoteId: devisRefonte.id, position: 1, description: 'Audit du site existant et architecture de l’information', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(750_000), amountCents: XOF(750_000) },
    { organizationId: org.id, quoteId: devisRefonte.id, position: 2, description: 'Design des interfaces — 14 écrans, versions mobile et bureau', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(1_200_000), amountCents: XOF(1_200_000) },
    { organizationId: org.id, quoteId: devisRefonte.id, position: 3, description: 'Développement du catalogue, du panier et du paiement Mobile Money', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(2_100_000), amountCents: XOF(2_100_000) },
    { organizationId: org.id, quoteId: devisRefonte.id, position: 4, description: 'Formation de l’équipe officine', quantity: '3.000', unit: 'jour', unitPriceCents: XOF(150_000), amountCents: XOF(450_000) },
    // DEV-2026-0002 — 900 000 + 1 500 000 = 2 400 000
    { organizationId: org.id, quoteId: devisPackaging.id, position: 1, description: 'Création du logo et de la charte graphique', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(900_000), amountCents: XOF(900_000) },
    { organizationId: org.id, quoteId: devisPackaging.id, position: 2, description: 'Déclinaison packaging', quantity: '6.000', unit: 'référence', unitPriceCents: XOF(250_000), amountCents: XOF(1_500_000) },
    // DEV-2026-0003 — 500 000 + 250 000 + 100 000 = 850 000
    { organizationId: org.id, quoteId: devisVitrine.id, position: 1, description: 'Site vitrine 5 pages, rédaction incluse', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(500_000), amountCents: XOF(500_000) },
    { organizationId: org.id, quoteId: devisVitrine.id, position: 2, description: 'Module de prise de rendez-vous', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(250_000), amountCents: XOF(250_000) },
    { organizationId: org.id, quoteId: devisVitrine.id, position: 3, description: 'Hébergement et maintenance, première année', quantity: '1.000', unit: 'an', unitPriceCents: XOF(100_000), amountCents: XOF(100_000) },
    // DEV-2026-0004 — 1 400 000 + 3 600 000 + 1 200 000 = 6 200 000
    { organizationId: org.id, quoteId: devisElearning.id, position: 1, description: 'Cadrage fonctionnel et parcours pédagogique', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(1_400_000), amountCents: XOF(1_400_000) },
    { organizationId: org.id, quoteId: devisElearning.id, position: 2, description: 'Développement de la plateforme (cours, quiz, suivi)', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(3_600_000), amountCents: XOF(3_600_000) },
    { organizationId: org.id, quoteId: devisElearning.id, position: 3, description: 'Mode hors-ligne et application mobile', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(1_200_000), amountCents: XOF(1_200_000) },
  ]);

  // --- Contrats --------------------------------------------------------------

  const [contratRefonte, , contratVitrine] = await db
    .insert(contracts)
    .values([
      {
        organizationId: org.id,
        projectId: refonte.id,
        clientId: pharmacie.id,
        quoteId: devisRefonte.id,
        number: 'CTR-2026-0001',
        title: 'Contrat de prestation — Refonte du site et vente en ligne',
        status: 'signed',
        bodyMarkdown: contratRefonteMarkdown(),
        sentAt: at(-63, 10),
        signedAt: at(-62, 15),
        signedByName: 'Dr. Kouadio N’Guessan',
        signedByEmail: HERO_CLIENT_EMAIL,
        expiresAt: day(-33),
        createdBy: owner.id,
        createdAt: at(-64, 9),
      },
      {
        organizationId: org.id,
        projectId: packaging.id,
        clientId: woro.id,
        quoteId: devisPackaging.id,
        number: 'CTR-2026-0002',
        title: 'Contrat de création — Identité visuelle et packaging',
        status: 'signed',
        bodyMarkdown: contratPackagingMarkdown(),
        sentAt: at(-120, 11),
        signedAt: at(-119, 9),
        signedByName: 'Grâce Wôrô Adjovi',
        signedByEmail: 'direction@woro-cosmetiques.bj',
        expiresAt: day(-90),
        createdBy: fatou.id,
        createdAt: at(-121, 14),
      },
      {
        // `sent`, not `draft`: the portal only offers a signature pad once the
        // contract has been sent, and the video films the client signing — not
        // the agency sending. Unsigned, so the signature is still ahead of us.
        organizationId: org.id,
        projectId: vitrine.id,
        clientId: aissata.id,
        quoteId: devisVitrine.id,
        number: 'CTR-2026-0003',
        title: 'Contrat de prestation — Site vitrine cabinet RH',
        status: 'sent',
        bodyMarkdown: contratVitrineMarkdown(),
        sentAt: at(-2, 11),
        expiresAt: day(21),
        createdBy: fatou.id,
        createdAt: at(-7, 16),
      },
    ])
    .returning();

  // --- Factures --------------------------------------------------------------

  const [acompte, factureWoro, solde, factureVitrine, factureBrouillon] = await db
    .insert(invoices)
    .values([
      {
        // Payée par Mobile Money — la preuve que la chaîne encaisse.
        organizationId: org.id,
        projectId: refonte.id,
        clientId: pharmacie.id,
        contractId: contratRefonte.id,
        number: 'FAC-2026-0001',
        status: 'paid',
        currency: 'XOF',
        subtotalCents: XOF(1_800_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(324_000),
        totalCents: XOF(2_124_000),
        amountPaidCents: XOF(2_124_000),
        issueDate: day(-61),
        dueDate: day(-31),
        paidAt: at(-58, 12),
        notes: 'Acompte de 40 % prévu au contrat CTR-2026-0001.',
        createdBy: owner.id,
        createdAt: at(-61, 10),
      },
      {
        // 28 jours de retard : la relance J+30 tombe dans deux jours.
        organizationId: org.id,
        projectId: packaging.id,
        clientId: woro.id,
        number: 'FAC-2026-0002',
        status: 'overdue',
        currency: 'XOF',
        subtotalCents: XOF(2_400_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(432_000),
        totalCents: XOF(2_832_000),
        amountPaidCents: XOF(0),
        issueDate: day(-58),
        dueDate: day(-28),
        notes: 'Solde à la livraison des gabarits imprimeur.',
        createdBy: fatou.id,
        createdAt: at(-58, 9),
      },
      {
        // Celle que le client paie en direct pendant la vidéo.
        organizationId: org.id,
        projectId: refonte.id,
        clientId: pharmacie.id,
        contractId: contratRefonte.id,
        number: 'FAC-2026-0003',
        status: 'sent',
        currency: 'XOF',
        subtotalCents: XOF(2_700_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(486_000),
        totalCents: XOF(3_186_000),
        amountPaidCents: XOF(0),
        issueDate: day(-7),
        dueDate: day(23),
        notes: 'Solde de 60 % — lots 1 et 2 livrés et recettés.',
        createdBy: owner.id,
        createdAt: at(-7, 11),
      },
      {
        organizationId: org.id,
        projectId: vitrine.id,
        clientId: aissata.id,
        number: 'FAC-2026-0004',
        status: 'partial',
        currency: 'XOF',
        subtotalCents: XOF(850_000),
        taxRateBps: 0,
        taxCents: XOF(0),
        totalCents: XOF(850_000),
        amountPaidCents: XOF(300_000),
        issueDate: day(-16),
        dueDate: day(14),
        notes: 'Acompte reçu par virement, solde à la mise en ligne.',
        createdBy: yao.id,
        createdAt: at(-16, 14),
      },
      {
        organizationId: org.id,
        projectId: packaging.id,
        clientId: woro.id,
        number: 'FAC-2026-0005',
        status: 'draft',
        currency: 'XOF',
        subtotalCents: XOF(350_000),
        taxRateBps: TVA_CI,
        taxCents: XOF(63_000),
        totalCents: XOF(413_000),
        amountPaidCents: XOF(0),
        issueDate: day(-1),
        dueDate: day(29),
        notes: 'Deux références supplémentaires demandées hors devis.',
        createdBy: fatou.id,
        createdAt: at(-1, 16),
      },
    ])
    .returning();

  await db.insert(invoiceItems).values([
    { organizationId: org.id, invoiceId: acompte.id, position: 1, description: 'Acompte 40 % — refonte du site et vente en ligne', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(1_800_000), amountCents: XOF(1_800_000) },
    { organizationId: org.id, invoiceId: factureWoro.id, position: 1, description: 'Création du logo et de la charte graphique', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(900_000), amountCents: XOF(900_000) },
    { organizationId: org.id, invoiceId: factureWoro.id, position: 2, description: 'Déclinaison packaging', quantity: '6.000', unit: 'référence', unitPriceCents: XOF(250_000), amountCents: XOF(1_500_000) },
    { organizationId: org.id, invoiceId: solde.id, position: 1, description: 'Solde 60 % — refonte du site et vente en ligne', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(2_700_000), amountCents: XOF(2_700_000) },
    { organizationId: org.id, invoiceId: factureVitrine.id, position: 1, description: 'Site vitrine 5 pages, rédaction incluse', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(500_000), amountCents: XOF(500_000) },
    { organizationId: org.id, invoiceId: factureVitrine.id, position: 2, description: 'Module de prise de rendez-vous', quantity: '1.000', unit: 'forfait', unitPriceCents: XOF(250_000), amountCents: XOF(250_000) },
    { organizationId: org.id, invoiceId: factureVitrine.id, position: 3, description: 'Hébergement et maintenance, première année', quantity: '1.000', unit: 'an', unitPriceCents: XOF(100_000), amountCents: XOF(100_000) },
    { organizationId: org.id, invoiceId: factureBrouillon.id, position: 1, description: 'Déclinaison packaging — références hors devis', quantity: '2.000', unit: 'référence', unitPriceCents: XOF(175_000), amountCents: XOF(350_000) },
  ]);

  // Un encaissement passerelle (1 % de frais) et un virement saisi à la main :
  // les deux sources que l'écran de facture doit savoir afficher.
  await db.insert(invoicePayments).values([
    {
      organizationId: org.id,
      invoiceId: acompte.id,
      amountCents: XOF(2_124_000),
      paidAt: at(-58, 12),
      method: 'mobile_money',
      source: 'geniuspay',
      gatewayReference: 'GP-SBX-2026-000148',
      gatewayFeesCents: XOF(21_240),
      netAmountCents: XOF(2_102_760),
      notes: 'Wave — +225 07 00 12 34 56',
    },
    {
      organizationId: org.id,
      invoiceId: factureVitrine.id,
      amountCents: XOF(300_000),
      paidAt: at(-11, 9),
      method: 'bank_transfer',
      source: 'manual',
      reference: 'VIR-ECO-88214',
      notes: 'Virement Ecobank reçu le matin, saisi par Yao.',
      recordedBy: yao.id,
    },
  ]);

  // Trois barreaux de l'échelle de relance déjà gravis : la vidéo montre le
  // quatrième (J+30) partir tout seul.
  await db.insert(invoiceReminders).values([
    { organizationId: org.id, invoiceId: factureWoro.id, stage: 0, daysOverdue: 1, amountDueCents: XOF(2_832_000), sentAt: at(-27, 8) },
    { organizationId: org.id, invoiceId: factureWoro.id, stage: 7, daysOverdue: 7, amountDueCents: XOF(2_832_000), sentAt: at(-21, 8) },
    { organizationId: org.id, invoiceId: factureWoro.id, stage: 14, daysOverdue: 14, amountDueCents: XOF(2_832_000), sentAt: at(-14, 8) },
  ]);

  // --- Dépenses --------------------------------------------------------------

  await db.insert(expenses).values([
    { organizationId: org.id, projectId: refonte.id, category: 'software', description: 'Licences Figma — 3 sièges, 3 mois', amountCents: XOF(90_000), currency: 'XOF', incurredOn: day(-59), vendor: 'Figma', billable: false, reimbursed: true, createdBy: owner.id, createdAt: at(-59, 10) },
    { organizationId: org.id, projectId: refonte.id, category: 'subcontractor', description: 'Intégration de la passerelle de paiement — prestataire externe', amountCents: XOF(450_000), currency: 'XOF', incurredOn: day(-36), vendor: 'Konan Dev', billable: true, reimbursed: false, createdBy: yao.id, createdAt: at(-36, 15) },
    { organizationId: org.id, projectId: refonte.id, category: 'hardware', description: 'Tablette de recette Android', amountCents: XOF(220_000), currency: 'XOF', incurredOn: day(-45), vendor: 'Cash Center Abidjan', billable: false, reimbursed: true, createdBy: owner.id, createdAt: at(-45, 12) },
    { organizationId: org.id, projectId: packaging.id, category: 'travel', description: 'Déplacement Cotonou — présentation des packagings', amountCents: XOF(185_000), currency: 'XOF', incurredOn: day(-24), vendor: 'Africa World Airlines', billable: true, reimbursed: false, createdBy: fatou.id, createdAt: at(-24, 18) },
    { organizationId: org.id, projectId: packaging.id, category: 'other', description: 'Impression des épreuves couleur', amountCents: XOF(64_000), currency: 'XOF', incurredOn: day(-20), vendor: 'Imprimerie Nouvelle', billable: false, reimbursed: true, createdBy: fatou.id, createdAt: at(-20, 11) },
  ]);

  // --- Livrables -------------------------------------------------------------

  await db.insert(deliverables).values([
    { organizationId: org.id, projectId: refonte.id, title: 'Maquettes des interfaces — v2', description: '14 écrans, versions mobile et bureau, après le premier tour de retours.', status: 'approved', submittedAt: at(-41, 17), reviewedAt: at(-39, 10), reviewedByName: 'Dr. Kouadio N’Guessan', reviewedByEmail: HERO_CLIENT_EMAIL, version: 2, createdBy: owner.id, createdAt: at(-41, 17) },
    { organizationId: org.id, projectId: refonte.id, title: 'Cahier d’architecture technique', description: 'Schéma de base de données, choix d’hébergement, plan de sauvegarde.', status: 'submitted', submittedAt: at(-5, 16), version: 1, createdBy: yao.id, createdAt: at(-5, 16) },
    { organizationId: org.id, projectId: packaging.id, title: 'Gabarits imprimeur — 6 références', description: 'Fichiers vectoriels avec traits de coupe et fonds perdus.', status: 'approved', submittedAt: at(-13, 14), reviewedAt: at(-12, 17), reviewedByName: 'Grâce Wôrô Adjovi', reviewedByEmail: 'direction@woro-cosmetiques.bj', version: 1, createdBy: fatou.id, createdAt: at(-13, 14) },
  ]);

  // --- Avis client -----------------------------------------------------------

  const [demandeAvis] = await db
    .insert(reviewRequests)
    .values({
      organizationId: org.id,
      projectId: packaging.id,
      clientId: woro.id,
      status: 'submitted',
      sentAt: at(-12, 18),
      expiresAt: at(18, 18),
      createdBy: fatou.id,
      createdAt: at(-12, 18),
    })
    .returning();

  await db.insert(reviews).values({
    organizationId: org.id,
    requestId: demandeAvis.id,
    projectId: packaging.id,
    clientId: woro.id,
    rating: 5,
    comment:
      'Travail livré dans les délais et gabarits acceptés du premier coup par notre imprimeur. ' +
      'Le suivi par lien client nous a évité une dizaine d’allers-retours par mail.',
    submittedAt: at(-10, 9),
    submittedByName: 'Grâce Wôrô Adjovi',
    submittedByEmail: 'direction@woro-cosmetiques.bj',
    isPublic: true,
    moderationStatus: 'approved',
  });

  // --- Espace développeurs ---------------------------------------------------

  // The developer screen is filmed, and it opens on an empty state unless there
  // is something to list. An API key and an endpoint with a real delivery history
  // are what make the scene mean anything — including one delivery that failed
  // and was retried, because a webhook page that only ever shows green is not
  // showing the part that matters.
  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      organizationId: org.id,
      name: 'Intégration comptabilité',
      prefix: 'sk_live_9Kd',
      keyHash: hashSecret(`sk_live_9Kd${'demo'}${org.id}`),
      scopes: ['clients:read', 'invoices:read', 'invoices:write', 'quotes:read'],
      createdBy: owner.id,
      lastUsedAt: at(-1, 6),
      createdAt: at(-45, 15),
    })
    .returning();

  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId: org.id,
      // `generic`, never `n8n_primary`. That kind is the **global** route:
      // `queueDeliveries` forwards every organization's events to it, and
      // `/api/v1/webhooks/verify` reads the first active one to check
      // signatures. A demo endpoint declared `n8n_primary` therefore hijacks
      // the whole instance — every tenant's webhooks are sent to the demo URL
      // and silently fail there.
      kind: 'generic',
      url: 'https://n8n.studiobaobab.ci/webhook/contravo',
      // Same shape as `generateWebhookSecret` in lib/webhooks, which is internal.
      secret: 'whsec_' + crypto.randomBytes(24).toString('base64url'),
      events: [
        'quote.sent',
        'quote.accepted',
        'contract.signed',
        'invoice.sent',
        'invoice.paid',
        'invoice.overdue',
      ],
      active: true,
      createdAt: at(-45, 16),
    })
    .returning();

  await db.insert(webhookDeliveries).values([
    { endpointId: endpoint.id, event: 'invoice.paid', payload: { invoice: { number: 'FAC-2026-0001' } }, status: 'success', attempts: 1, lastResponseCode: 200, createdAt: at(-58, 12), deliveredAt: at(-58, 12) },
    { endpointId: endpoint.id, event: 'invoice.overdue', payload: { invoice: { number: 'FAC-2026-0002' } }, status: 'success', attempts: 1, lastResponseCode: 200, createdAt: at(-27, 8), deliveredAt: at(-27, 8) },
    // Failed once on a gateway timeout, then went through on the second attempt.
    { endpointId: endpoint.id, event: 'invoice.overdue', payload: { invoice: { number: 'FAC-2026-0002' } }, status: 'success', attempts: 2, lastResponseCode: 200, lastResponseBody: 'OK', createdAt: at(-21, 8), deliveredAt: at(-21, 9) },
    { endpointId: endpoint.id, event: 'invoice.overdue', payload: { invoice: { number: 'FAC-2026-0002' } }, status: 'success', attempts: 1, lastResponseCode: 200, createdAt: at(-14, 8), deliveredAt: at(-14, 8) },
    { endpointId: endpoint.id, event: 'quote.sent', payload: { quote: { number: 'DEV-2026-0003' } }, status: 'success', attempts: 1, lastResponseCode: 200, createdAt: at(-9, 9), deliveredAt: at(-9, 9) },
    { endpointId: endpoint.id, event: 'invoice.sent', payload: { invoice: { number: 'FAC-2026-0003' } }, status: 'success', attempts: 1, lastResponseCode: 200, createdAt: at(-7, 11), deliveredAt: at(-7, 11) },
    { endpointId: endpoint.id, event: 'contract.signed', payload: { contract: { number: 'CTR-2026-0002' } }, status: 'failed', attempts: 3, lastResponseCode: 502, lastResponseBody: 'Bad Gateway', createdAt: at(-3, 14), nextRetryAt: at(-3, 15) },
  ]);

  // --- Compteurs -------------------------------------------------------------

  // Without this, the next document created on camera would be numbered
  // `DEV-2026-0001` and collide with a row that already exists.
  const year = NOW.getFullYear();
  await db.insert(documentSequences).values([
    { organizationId: org.id, docType: 'quote', year, lastNumber: 4 },
    { organizationId: org.id, docType: 'contract', year, lastNumber: 3 },
    { organizationId: org.id, docType: 'invoice', year, lastNumber: 5 },
    { organizationId: org.id, docType: 'project', year, lastNumber: 4 },
  ]);

  // `quota_usage` is deliberately not written here: AFTER INSERT/UPDATE/DELETE
  // triggers on `clients`, `projects`, `memberships`, `api_keys` and
  // `webhook_endpoints` already maintain that row, and they got the counts right
  // on their own. Writing it by hand only risks disagreeing with them.
  await db
    .insert(storageUsage)
    .values({ organizationId: org.id, totalBytes: 0n, fileCount: 0 })
    .onConflictDoNothing();

  // --- Récapitulatif ---------------------------------------------------------

  console.log(`\n${ORG_NAME} — ${org.id}\n`);
  console.log(`  Propriétaire     ${OWNER_EMAIL} (mot de passe inchangé)`);
  console.log(`  Équipe           Fatou Diarra (admin), Yao Kouassi (membre) — ${TEAM_PASSWORD}`);
  console.log(`  Client vedette   Pharmacie du Plateau <${HERO_CLIENT_EMAIL}>`);
  console.log('');
  console.log('  4 clients · 4 projets · 4 devis · 3 contrats · 5 factures');
  console.log('  2 encaissements · 3 relances · 5 dépenses · 3 livrables · 1 avis 5★');
  console.log('');
  console.log('  Prêts à filmer en direct :');
  console.log(`    · DEV-2026-0003  brouillon, à envoyer puis accepter    ${devisVitrine.id}`);
  console.log(`    · CTR-2026-0003  envoyé, à signer depuis le portail    ${contratVitrine.id}`);
  console.log(`    · FAC-2026-0003  3 186 000 XOF à payer en Mobile Money  ${solde.id}`);
  console.log(`    · FAC-2026-0002  28 jours de retard, J+30 dans 2 jours  ${factureWoro.id}`);
  console.log('');
  console.log('  Aucun PDF stocké : ils se génèrent au premier envoi ou depuis « Régénérer ».');
  console.log('');
}

// --- Corps des contrats ------------------------------------------------------
// Kept at the bottom so the data above stays readable. These are plausible
// contract bodies, not legal advice — they exist to fill a PDF on screen.

function contratRefonteMarkdown(): string {
  return `# Contrat de prestation de services

**Entre les soussignés :**

**Studio Baobab SARL**, agence de conception numérique, dont le siège est à Cocody Riviera Golf, Abidjan, Côte d'Ivoire, immatriculée au RCCM sous le numéro CI-ABJ-2024-B-14208, ci-après « le Prestataire ».

**Pharmacie du Plateau SARL**, Avenue Chardy, Immeuble Alpha 2000, Abidjan Plateau, ci-après « le Client ».

## Article 1 — Objet

Le Prestataire réalise la refonte du site internet du Client, incluant un catalogue de produits, un dépôt d'ordonnance en ligne et l'encaissement par Mobile Money, conformément au devis DEV-2026-0001 annexé au présent contrat.

## Article 2 — Livrables et jalons

La prestation est découpée en trois lots :

1. **Lot 1 — Catalogue** : arborescence, fiches produits, moteur de recherche.
2. **Lot 2 — Commande** : panier, dépôt d'ordonnance, espace client.
3. **Lot 3 — Paiement** : encaissement Mobile Money et carte, réconciliation.

Chaque lot est soumis à recette. Le Client dispose de sept jours ouvrés pour formuler ses réserves ; passé ce délai, le lot est réputé accepté.

## Article 3 — Prix et modalités de paiement

Le montant total est de **5 310 000 francs CFA TTC** (4 500 000 F HT, TVA 18 %).

- Acompte de 40 % à la signature, soit 2 124 000 F TTC.
- Solde de 60 % à la livraison du lot 3, soit 3 186 000 F TTC.

Les factures sont payables à trente jours. Tout retard fait courir un intérêt de 1 % par mois entamé.

## Article 4 — Durée

Le contrat prend effet à sa signature et s'achève à la recette du lot 3, prévue au plus tard quatre mois après le versement de l'acompte.

## Article 5 — Propriété intellectuelle

Les droits d'exploitation des livrables sont cédés au Client au paiement intégral du prix. Le Prestataire conserve le droit de citer la réalisation dans ses références.

## Article 6 — Confidentialité

Chaque partie s'engage à ne divulguer aucune information confidentielle de l'autre, pendant la durée du contrat et les deux années qui suivent son terme.

## Article 7 — Résiliation

En cas de manquement, la partie lésée peut résilier le contrat trente jours après une mise en demeure restée sans effet. Les prestations réalisées restent dues.

## Article 8 — Droit applicable

Le présent contrat est soumis au droit ivoirien. Les parties tenteront un règlement amiable avant toute action devant les tribunaux d'Abidjan.
`;
}

function contratPackagingMarkdown(): string {
  return `# Contrat de création graphique

**Entre Studio Baobab SARL**, Abidjan, Côte d'Ivoire, ci-après « le Prestataire », **et Wôrô Cosmétiques SA**, Carré 1284, Quartier Gbedjromédé, Cotonou, Bénin, ci-après « le Client ».

## Article 1 — Objet

Création de l'identité visuelle de la marque Wôrô et de sa déclinaison sur six références de packaging, conformément au devis DEV-2026-0002.

## Article 2 — Livrables

- Logo en versions principale, monochrome et réduite, aux formats vectoriels et bitmap.
- Charte graphique : palette, typographies, règles d'usage.
- Six gabarits d'emballage prêts pour l'imprimeur, traits de coupe et fonds perdus compris.

## Article 3 — Corrections

Deux tours de correction sont inclus par livrable. Tout tour supplémentaire est facturé 85 000 F HT.

## Article 4 — Prix

**2 832 000 francs CFA TTC** (2 400 000 F HT, TVA 18 %), payable à la livraison des gabarits imprimeur.

## Article 5 — Cession de droits

La cession des droits d'exploitation, pour tous supports et sans limitation de durée sur le territoire de la CEDEAO, prend effet au paiement intégral.

## Article 6 — Droit applicable

Droit béninois. Juridiction compétente : tribunal de commerce de Cotonou.
`;
}

function contratVitrineMarkdown(): string {
  return `# Contrat de prestation de services

**Entre Studio Baobab SARL**, Abidjan, ci-après « le Prestataire », **et Madame Aïssata Traoré**, consultante en ressources humaines, Rue des Jardins, Résidence Bimbresso, Abidjan Deux-Plateaux, ci-après « la Cliente ».

## Article 1 — Objet

Conception et mise en ligne d'un site vitrine de cinq pages pour le cabinet de la Cliente, incluant un module de prise de rendez-vous et un blog, conformément au devis DEV-2026-0003.

## Article 2 — Contenus

La Cliente fournit les textes et photographies dans les dix jours suivant la signature. La rédaction des textes est incluse dans la prestation ; la Cliente en valide une version avant intégration.

## Article 3 — Délai

Mise en ligne sous six semaines à compter de la réception des contenus.

## Article 4 — Prix

**850 000 francs CFA**, la Cliente relevant du régime de la franchise de TVA.

- Acompte de 50 % au démarrage, soit 425 000 F.
- Solde à la mise en ligne, soit 425 000 F.

## Article 5 — Hébergement et maintenance

La première année d'hébergement et de maintenance corrective est incluse. Le renouvellement est proposé au tarif en vigueur, sans reconduction automatique.

## Article 6 — Droit applicable

Droit ivoirien. Tribunaux d'Abidjan.
`;
}

main()
  .catch((error) => {
    console.error('\nSeed interrompu :', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
