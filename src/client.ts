import type {
  AuthorizeParams,
  CaptureParams,
  ChargeParams,
  CheckoutSession,
  CheckoutSessionParams,
  ClientConfig,
  RefundParams,
  Transaction,
  TransactionList,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.uat.payments-central.com';

export class PaymentsCentralClient {
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly baseUrl: string;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.merchantId = config.merchantId;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'x-merchant-id': this.merchantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let message = `API error ${response.status}: ${response.statusText}`;
      try {
        const err = await response.json() as { message?: string; error?: string };
        message = err.message ?? err.error ?? message;
      } catch {
        // keep the default message if body isn't JSON
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  charge(params: ChargeParams): Promise<Transaction> {
    return this.request<Transaction>('POST', '/api/v1/transactions/charge', params);
  }

  getTransaction(id: string): Promise<Transaction> {
    return this.request<Transaction>('GET', `/api/v1/transactions/${encodeURIComponent(id)}`);
  }

  // core paginates with `page` (1-based) and `limit`; `offset` is ignored.
  // Response shape: { data, total, page, limit }.
  listTransactions(page = 1, limit = 10): Promise<TransactionList> {
    return this.request<TransactionList>('GET', '/api/v1/transactions', undefined, {
      page,
      limit,
    });
  }

  // A fresh charge is `pending`. core only allows a refund once a transaction
  // is captured (or settled), reachable via authorize -> capture. `authorize`
  // drives pending -> authorized; `gateway_ref` is optional.
  authorize(id: string, params: AuthorizeParams = {}): Promise<Transaction> {
    return this.request<Transaction>('POST', `/api/v1/transactions/${encodeURIComponent(id)}/authorize`, params);
  }

  // `capture` drives authorized -> captured. core captures the full authorized
  // amount; any `amount` passed is currently ignored by the capture route.
  capture(id: string, params: CaptureParams = {}): Promise<Transaction> {
    return this.request<Transaction>('POST', `/api/v1/transactions/${encodeURIComponent(id)}/capture`, params);
  }

  refund(id: string, params: RefundParams): Promise<Transaction> {
    return this.request<Transaction>('POST', `/api/v1/transactions/${encodeURIComponent(id)}/refund`, params);
  }

  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    return this.request<CheckoutSession>('POST', '/api/v1/checkout/sessions', params);
  }
}
