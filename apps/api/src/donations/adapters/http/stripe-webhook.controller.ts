import { BadRequestException, Body, Controller, Headers, HttpCode, Post, ServiceUnavailableException, Inject, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { HandleStripeEvent, type VerifiedStripeEvent } from '../../application/handle-stripe-event.js';
import { STRIPE_CLIENT } from '../stripe/stripe.tokens.js';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly handler: HandleStripeEvent,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Body() _parsedBody: unknown,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret || !signature || !request.rawBody) throw new BadRequestException('Webhook Stripe inválido');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(request.rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Webhook Stripe inválido');
    }
    try {
      await this.handler.execute(toVerifiedStripeEvent(event));
    } catch {
      throw new ServiceUnavailableException('Webhook Stripe temporariamente indisponível');
    }
    return { received: true };
  }
}

function toVerifiedStripeEvent(event: Stripe.Event): VerifiedStripeEvent {
  const session = event.data.object as Stripe.Checkout.Session;
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    session: {
      id: session.id,
      object: session.object,
      orderId: session.metadata?.donation_order_id ?? null,
      paymentId: session.metadata?.donation_payment_id ?? null,
    },
  };
}
