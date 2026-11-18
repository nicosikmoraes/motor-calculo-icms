import { BadRequestException, Body, Controller, Headers, HttpCode, Post, ServiceUnavailableException, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorEnvelopeDoc } from '../../dto/api-error.response.js';
import { WebhookReceivedEnvelopeDoc } from '../../dto/donations/webhook-received.response.js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../decorators/public.decorator.js';
import { HandlePaymentEvent } from '../../../donations/application/handle-payment-event.js';
import { InvalidStripeWebhookError } from '../../../donations/adapters/stripe/invalid-stripe-webhook.error.js';
import { StripeWebhookAdapter } from '../../../donations/adapters/stripe/stripe-webhook.adapter.js';

// Público: quem chama é o Stripe, sem token. A prova de origem é a assinatura Stripe-Signature.
@Public()
@ApiTags('webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private readonly webhook: StripeWebhookAdapter,
    private readonly handler: HandlePaymentEvent,
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
    try {
      const event = this.webhook.verify(request.rawBody, signature);
      if (event) await this.handler.execute(event);
    } catch (error) {
      if (error instanceof InvalidStripeWebhookError) throw new BadRequestException(error.message);
      throw new ServiceUnavailableException('Webhook Stripe temporariamente indisponível');
    }
    return { received: true };
  }
}
