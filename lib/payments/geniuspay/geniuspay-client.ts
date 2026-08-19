import crypto from 'crypto';

export interface InitiatePaymentParams {
  amount: number;
  currency?: string;
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string;
  };
  successUrl?: string;
  errorUrl?: string;
  metadata?: Record<string, any>;
  paymentMethod?: string;
  gateway?: string;
  mmoProvider?: string;
}

export interface GeniusPayPaymentResponse {
  success: boolean;
  data?: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    fees?: number;
    net_amount?: number;
    status: string;
    checkout_url?: string;
    payment_url?: string;
    metadata?: Record<string, any>;
    environment: string;
    expires_at?: string;
    created_at?: string;
    completed_at?: string;
    payment_method?: string;
    payment_provider?: string;
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface GeniusPayAccountResponse {
  success: boolean;
  data?: {
    /** A uuid in practice, though the documentation shows an integer. */
    id: string | number;
    /** What the live API returns; the documentation calls it `business_name`. */
    name?: string;
    business_name?: string;
    email?: string;
    status?: string;
    /** `sandbox` or `live` — the gateway's own word on which keys these are. */
    environment?: string;
    type?: string;
    created_at?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class GeniusPayClient {
  private publicKey: string;
  private secretKey: string;
  private environment: 'sandbox' | 'live';
  private baseUrl: string;

  constructor(publicKey: string, secretKey: string, environment: 'sandbox' | 'live' = 'sandbox') {
    // L'URL est la même des deux côtés : c'est la **clé** qui décide du bac à
    // sable ou du réel, jamais ce paramètre. Déclarer `live` en gardant des
    // clés sandbox laissait donc tourner de vrais paiements en simulation, sans
    // le moindre signe. Le désaccord devient une erreur immédiate.
    const declared = environment === 'live' ? 'live' : 'sandbox';
    const actual = publicKey.includes('sandbox')
      ? 'sandbox'
      : publicKey.includes('live')
        ? 'live'
        : null;

    if (actual && actual !== declared) {
      throw new Error(
        `Clés GeniusPay ${actual} pour un environnement déclaré ${declared}. ` +
          'Le nom du bac à sable ne tient qu’aux clés : corriger les deux ensemble.'
      );
    }

    this.publicKey = publicKey;
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = 'https://geniuspay.ci/api/v1/merchant';
  }

  /**
   * Helper to perform signed requests to GeniusPay
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-API-Key': this.publicKey,
      'X-API-Secret': this.secretKey,
      'Content-Type': 'application/json',
      // Sans cet en-tête, la passerelle répond à une erreur de validation par
      // une page HTML en 200 plutôt qu'un 422 JSON : le motif du refus se
      // perdait derrière un « Unexpected token '<' » illisible.
      Accept: 'application/json',
      ...options.headers,
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      try {
        const errorJson = JSON.parse(text);
        throw new Error(errorJson.error?.message || `GeniusPay API returned HTTP ${res.status}`);
      } catch (e) {
        throw new Error(`GeniusPay API returned HTTP ${res.status}: ${text}`);
      }
    }

    return res.json() as Promise<T>;
  }

  /**
   * Initiates a payment transaction on GeniusPay
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<GeniusPayPaymentResponse> {
    const body: Record<string, any> = {
      amount: params.amount,
      currency: params.currency || 'XOF',
      description: params.description,
      customer: params.customer,
      success_url: params.successUrl,
      error_url: params.errorUrl,
      metadata: params.metadata || {},
    };

    if (params.paymentMethod) {
      body.payment_method = params.paymentMethod;
    }
    if (params.gateway) {
      body.gateway = params.gateway;
    }
    if (params.mmoProvider) {
      body.mmo_provider = params.mmoProvider;
    }

    return this.request<GeniusPayPaymentResponse>('/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Reads the merchant account behind the keys.
   *
   * The only harmless call that proves a key pair works, so it doubles as the
   * check run when an organization connects its gateway: nothing is charged, and
   * the answer carries the merchant's own name and the environment the gateway
   * itself considers active — which is the authority on `sandbox` vs `live`,
   * rather than what the form claimed.
   */
  async getAccount(): Promise<GeniusPayAccountResponse> {
    return this.request<GeniusPayAccountResponse>('/account', { method: 'GET' });
  }

  /**
   * Retrieves detail of a payment transaction by reference
   */
  async getPayment(reference: string): Promise<GeniusPayPaymentResponse> {
    return this.request<GeniusPayPaymentResponse>(`/payments/${reference}`, {
      method: 'GET',
    });
  }

  /**
   * Verifies the signature of an incoming webhook request
   */
  static verifyWebhookSignature(
    signature: string | null,
    timestamp: string | null,
    rawBody: string,
    webhookSecret: string
  ): boolean {
    if (!signature || !timestamp) {
      return false;
    }

    // Try verifying using rawBody directly
    const dataRaw = timestamp + '.' + rawBody;
    const computedRaw = crypto.createHmac('sha256', webhookSecret).update(dataRaw).digest('hex');

    const bufRaw = Buffer.from(computedRaw, 'hex');
    const bufSig = Buffer.from(signature, 'hex');

    if (bufRaw.length === bufSig.length && crypto.timingSafeEqual(bufRaw, bufSig)) {
      return true;
    }

    // If parsing format differed, try with compact JSON string representation
    try {
      const parsed = JSON.parse(rawBody);
      const compactBody = JSON.stringify(parsed);
      const dataCompact = timestamp + '.' + compactBody;
      const computedCompact = crypto.createHmac('sha256', webhookSecret).update(dataCompact).digest('hex');
      const bufCompact = Buffer.from(computedCompact, 'hex');
      if (bufCompact.length === bufSig.length && crypto.timingSafeEqual(bufCompact, bufSig)) {
        return true;
      }
    } catch (e) {
      // Ignore
    }

    return false;
  }
}
