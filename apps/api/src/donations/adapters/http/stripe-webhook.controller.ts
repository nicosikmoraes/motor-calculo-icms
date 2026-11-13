import { BadRequestException, Body, Controller, Headers, HttpCode, Post, ServiceUnavailableException, Inject, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorEnvelopeDoc, WebhookReceivedEnvelopeDoc } from './donation-api-docs.js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { HandleStripeEvent, type VerifiedStripeEvent } from '../../application/handle-stripe-event.js';
import { STRIPE_CLIENT } from '../stripe/stripe.tokens.js';

@ApiTags('webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly handler: HandleStripeEvent,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe eventos do Stripe; só eventos com assinatura válida confirmam pagamentos' })
  @ApiHeader({ name: 'Stripe-Signature', required: true, description: 'Assinatura do Stripe sobre o corpo bruto' })
  @ApiResponse({ status: 200, description: 'Evento processado ou já registrado', type: WebhookReceivedEnvelopeDoc })
  @ApiResponse({ status: 400, description: 'Assinatura ausente ou inválida', type: ApiErrorEnvelopeDoc })
  @ApiResponse({ status: 503, description: 'Falha temporária; o Stripe reenvia o evento', type: ApiErrorEnvelopeDoc })
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
  const object = event.data.object as unknown as { id: string; object: string; metadata?: Record<string, string> | null;
    amount?: unknown; currency?: unknown };
  const session = object;
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
      paymentIntentId: event.type === 'payment_intent.payment_failed' ? object.id : null,
      amountInCents: event.type === 'payment_intent.payment_failed' && typeof object.amount === 'number'
        && Number.isSafeInteger(object.amount) ? String(object.amount) : null,
      currency: event.type === 'payment_intent.payment_failed' && typeof object.currency === 'string' ? object.currency : null,
    },
  };
}
