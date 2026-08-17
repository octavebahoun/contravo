/**
 * SaaS subscription plans (MVP6).
 *
 * `priceMonthlyCents` is in **hundredths of XOF**: 15 000 XOF/month is
 * `15_000_00`. This is *not* the convention used by business documents, where a
 * `*_cents` column holds whole XOF because the franc has no subunit — see
 * `lib/money.ts`. The divergence is deliberate rather than migrated: this side
 * already divides by 100 before charging, and `subscription_cycles.amount_cents`
 * holds historical rows in the same unit. Format these values with
 * `formatSaasPrice`, never `formatMoney`.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyCents: 0,
    currency: 'XOF',
    quotas: {
      maxMembers: 3,
      maxClients: 10,
      maxProjects: 5,
      maxApiKeys: 1,
      maxWebhookEndpoints: 1,
      maxStorageBytes: 500 * 1024 * 1024, // 500 MB
      maxApiCallsPerMonth: 1_000,
      maxPublicTokensPerMonth: 50,
      pdfBrandingRemovable: false,
      supportLevel: 'community',
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyCents: 15_000_00, // 15 000 XOF/month
    currency: 'XOF',
    quotas: {
      maxMembers: 15,
      maxClients: 200,
      maxProjects: 100,
      maxApiKeys: 10,
      maxWebhookEndpoints: 10,
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      maxApiCallsPerMonth: 100_000,
      maxPublicTokensPerMonth: 5_000,
      pdfBrandingRemovable: true,
      supportLevel: 'email',
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyCents: 50_000_00, // 50 000 XOF/month
    currency: 'XOF',
    quotas: {
      maxMembers: null, // unlimited
      maxClients: null,
      maxProjects: null,
      maxApiKeys: 50,
      maxWebhookEndpoints: 50,
      maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
      maxApiCallsPerMonth: 1_000_000,
      maxPublicTokensPerMonth: 50_000,
      pdfBrandingRemovable: true,
      supportLevel: 'priority',
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type QuotaKey = keyof (typeof PLANS)['free']['quotas'];
