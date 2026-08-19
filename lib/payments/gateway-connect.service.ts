import { db } from '../db/drizzle';
import { paymentGatewayCredentials } from '../db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { encryptSecret } from './credentials.service';
import { GeniusPayClient } from './geniuspay/geniuspay-client';
import { getAppUrl } from '@/lib/config/app-url';
import { ApiError } from '@/lib/rbac';

/**
 * Connecting an organization's own GeniusPay account.
 *
 * The whole collection flow was already built — `createPaymentIntent`, the
 * checkout redirect, the signed webhook that re-fetches the transaction before
 * crediting it — but nothing could ever write a row into
 * `payment_gateway_credentials`. Only the demo seed did. So every real
 * organization had `onlinePayment: false`, the portal fell back to the bank
 * details, and the "Payer" button simply never appeared. This is the missing
 * half: the place where a provider hands over its keys.
 *
 * Secrets never come back out. What is stored is encrypted with
 * `PAYMENT_CREDENTIALS_KEK`, and the read path returns a masked public key and
 * nothing else.
 */

/** What the settings screen is allowed to see. */
export type GatewayStatus = {
  connected: boolean;
  provider: 'geniuspay';
  environment: 'sandbox' | 'live' | null;
  apiKeyPublicMasked: string | null;
  merchantId: string | null;
  businessName: string | null;
  status: string | null;
  lastVerifiedAt: string | null;
  /** The address to register on the GeniusPay dashboard. */
  webhookUrl: string;
};

/**
 * Which environment a key pair belongs to.
 *
 * The gateway serves both from the same base URL, so nothing but the key itself
 * says which one is in play — a wrong guess here would run real payments through
 * a simulation, or the reverse, with no visible sign.
 */
export function detectEnvironment(apiKeyPublic: string): 'sandbox' | 'live' | null {
  if (apiKeyPublic.includes('sandbox')) return 'sandbox';
  if (apiKeyPublic.includes('live')) return 'live';
  return null;
}

/** Enough of the public key to recognise it, never enough to use it. */
function mask(apiKeyPublic: string): string {
  if (apiKeyPublic.length <= 12) return `${apiKeyPublic.slice(0, 4)}…`;
  return `${apiKeyPublic.slice(0, 12)}…${apiKeyPublic.slice(-4)}`;
}

export async function getGatewayStatus(organizationId: string): Promise<GatewayStatus> {
  const webhookUrl = `${getAppUrl()}/api/v1/webhooks/geniuspay`;

  const [credentials] = await db
    .select()
    .from(paymentGatewayCredentials)
    .where(
      and(
        eq(paymentGatewayCredentials.organizationId, organizationId),
        eq(paymentGatewayCredentials.provider, 'geniuspay'),
        eq(paymentGatewayCredentials.status, 'active')
      )
    )
    .limit(1);

  if (!credentials) {
    return {
      connected: false,
      provider: 'geniuspay',
      environment: null,
      apiKeyPublicMasked: null,
      merchantId: null,
      businessName: null,
      status: null,
      lastVerifiedAt: null,
      webhookUrl,
    };
  }

  return {
    connected: true,
    provider: 'geniuspay',
    environment: credentials.environment as 'sandbox' | 'live',
    apiKeyPublicMasked: mask(credentials.apiKeyPublic),
    merchantId: credentials.merchantId,
    businessName: credentials.businessName,
    status: credentials.status,
    lastVerifiedAt: credentials.lastVerifiedAt?.toISOString() ?? null,
    webhookUrl,
  };
}

export type ConnectGatewayInput = {
  organizationId: string;
  userId?: string | null;
  apiKeyPublic: string;
  apiSecret: string;
  webhookSecret: string;
};

/**
 * Verifies a key pair against GeniusPay, then stores it.
 *
 * The check is `GET /account`: it charges nothing and fails loudly on a bad key,
 * so a typo is caught here rather than by a client stuck on a broken checkout
 * page. Its answer also states which environment the gateway itself is running —
 * the authority on the question, over anything the form claimed.
 */
export async function connectGateway(input: ConnectGatewayInput): Promise<GatewayStatus> {
  const { organizationId, userId, apiKeyPublic, apiSecret, webhookSecret } = input;

  const environment = detectEnvironment(apiKeyPublic);
  if (!environment) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cette clé publique ne ressemble ni à une clé sandbox ni à une clé live. ' +
        'Copiez-la depuis « Mes clés API » sur GeniusPay.',
      400
    );
  }

  const client = new GeniusPayClient(apiKeyPublic, apiSecret, environment);

  let account: Awaited<ReturnType<GeniusPayClient['getAccount']>>;
  try {
    account = await client.getAccount();
  } catch (error: any) {
    throw new ApiError(
      'GATEWAY_REJECTED_CREDENTIALS',
      `GeniusPay a refusé ces identifiants : ${error?.message || 'raison inconnue'}`,
      400
    );
  }

  if (!account?.success || !account.data) {
    throw new ApiError(
      'GATEWAY_REJECTED_CREDENTIALS',
      account?.error?.message || 'GeniusPay a refusé ces identifiants.',
      400
    );
  }

  const reported = account.data.environment;
  if (reported && reported !== environment) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Ces clés sont ${environment} mais GeniusPay répond en ${reported}. ` +
        'Reprenez la paire complète du même environnement.',
      400
    );
  }

  const secret = encryptSecret(apiSecret);
  const webhook = encryptSecret(webhookSecret);

  const values = {
    organizationId,
    provider: 'geniuspay',
    environment,
    apiKeyPublic,
    apiSecretEncrypted: secret.encrypted,
    apiSecretNonce: secret.nonce,
    webhookSecretEncrypted: webhook.encrypted,
    webhookSecretNonce: webhook.nonce,
    merchantId: account.data.id != null ? String(account.data.id) : null,
    // The live API answers `name`; the documentation promises `business_name`.
    businessName: account.data.name ?? account.data.business_name ?? null,
    status: 'active',
    lastVerifiedAt: new Date(),
    createdBy: userId ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(paymentGatewayCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [
        paymentGatewayCredentials.organizationId,
        paymentGatewayCredentials.provider,
        paymentGatewayCredentials.environment,
      ],
      set: {
        apiKeyPublic: values.apiKeyPublic,
        apiSecretEncrypted: values.apiSecretEncrypted,
        apiSecretNonce: values.apiSecretNonce,
        webhookSecretEncrypted: values.webhookSecretEncrypted,
        webhookSecretNonce: values.webhookSecretNonce,
        merchantId: values.merchantId,
        businessName: values.businessName,
        status: 'active',
        lastVerifiedAt: values.lastVerifiedAt,
        updatedAt: values.updatedAt,
      },
    });

  // At most one active gateway per organization. `createPaymentIntent` and the
  // portal both pick "the active geniuspay row" without naming an environment,
  // so leaving the previous one active would make which of the two answers the
  // next payment a matter of row order.
  await db
    .update(paymentGatewayCredentials)
    .set({ status: 'disabled', updatedAt: new Date() })
    .where(
      and(
        eq(paymentGatewayCredentials.organizationId, organizationId),
        eq(paymentGatewayCredentials.provider, 'geniuspay'),
        ne(paymentGatewayCredentials.environment, environment)
      )
    );

  return getGatewayStatus(organizationId);
}

/**
 * Turns online payment off without destroying the keys.
 *
 * Disabled rather than deleted: the row is the only record of which merchant
 * account collected the payments already in `payment_intents`, and reconnecting
 * is then a matter of flipping the status back rather than hunting the keys down
 * again. Nothing is charged in the meantime — every path that spends them
 * filters on `status = 'active'`.
 */
export async function disconnectGateway(organizationId: string): Promise<GatewayStatus> {
  await db
    .update(paymentGatewayCredentials)
    .set({ status: 'disabled', updatedAt: new Date() })
    .where(
      and(
        eq(paymentGatewayCredentials.organizationId, organizationId),
        eq(paymentGatewayCredentials.provider, 'geniuspay'),
        eq(paymentGatewayCredentials.status, 'active')
      )
    );

  return getGatewayStatus(organizationId);
}
