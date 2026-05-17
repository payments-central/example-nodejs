export interface ChargeParams {
  amount: number;
  currency: string;
  gateway: string;
  merchant_ref: string;
  description: string;
}

export interface RefundParams {
  amount?: number;
  reason: string;
}

export interface CheckoutSessionParams {
  amount: number;
  currency: string;
  description: string;
  success_url: string;
  cancel_url: string;
  type: string;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  merchant_ref: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionList {
  data: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface CheckoutSession {
  session_id: string;
  checkout_url: string;
  type: string;
  expires_at: string;
}

export interface ClientConfig {
  apiKey: string;
  merchantId: string;
  baseUrl?: string;
}
