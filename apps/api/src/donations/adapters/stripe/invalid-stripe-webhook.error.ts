export class InvalidStripeWebhookError extends Error {
  constructor() {
    super('Webhook Stripe inválido');
    this.name = 'InvalidStripeWebhookError';
  }
}
