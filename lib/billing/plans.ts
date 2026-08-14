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
    priceMonthlyCents: 15_000_00, // 15 000 XOF/month (1500000 cents in base unit if cents, or 15000 XOF in cents format)
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
