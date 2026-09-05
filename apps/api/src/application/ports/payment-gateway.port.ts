export interface PaymentChargeInput {
  externalReference: string;
  amountInCents: number;
  description: string;
  payer: { name: string; email: string };
}

export interface PaymentCharge {
  providerChargeId: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentUrl?: string;
  qrCode?: string;
}

export interface PaymentGateway {
  readonly providerKey: string;
  createCharge(input: PaymentChargeInput): Promise<PaymentCharge>;
  findCharge(providerChargeId: string): Promise<PaymentCharge>;
  verifyAndParseWebhook(payload: unknown, signature: string): Promise<PaymentCharge>;
}
