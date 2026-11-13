import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/*
 * Classes usadas só pela documentação OpenAPI. A validação de entrada continua
 * no caso de uso (`validateCreateDonationBody`), que devolve 422 com a mensagem
 * da spec; estas classes não são DTOs de validação.
 */

export class CreateDonationRequestDoc {
  @ApiProperty({ example: '10.00', description: 'Valor em reais, texto com até duas casas decimais (mínimo R$ 0,50)' })
  amount!: string;

  @ApiProperty({ example: 'BRL', enum: ['BRL'] })
  currency!: 'BRL';
}

export class DonationAttemptDoc {
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty({ example: 'pendente', enum: ['pendente', 'paga', 'recusada', 'expirada', 'indeterminada'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, example: null }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'cs_test_...' }) checkoutSessionId!: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'https://checkout.stripe.com/c/pay/cs_test_...' }) checkoutUrl!: string | null;
}

export class DonationEventDoc {
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty({ example: 'paga' }) status!: string;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

export class DonationOrderDoc {
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) paymentId?: string;
  @ApiProperty({ example: '10.00' }) amount!: string;
  @ApiProperty({ example: 'BRL' }) currency!: 'BRL';
  @ApiProperty({ example: 'pendente', enum: ['pendente', 'pago', 'indeterminada'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) reason?: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'https://checkout.stripe.com/c/pay/cs_test_...' }) checkoutUrl?: string | null;
  @ApiPropertyOptional({ type: [DonationAttemptDoc] }) attempts?: DonationAttemptDoc[];
  @ApiPropertyOptional({ type: [DonationEventDoc] }) events?: DonationEventDoc[];
}

export class DonationOrderEnvelopeDoc {
  @ApiProperty({ type: DonationOrderDoc }) data!: DonationOrderDoc;
}

export class WebhookReceivedDoc {
  @ApiProperty({ example: true }) received!: true;
}

export class WebhookReceivedEnvelopeDoc {
  @ApiProperty({ type: WebhookReceivedDoc }) data!: WebhookReceivedDoc;
}

export class ApiErrorDoc {
  @ApiProperty({ example: 422 }) statusCode!: number;
  @ApiProperty({ example: 'Informe um valor em reais de pelo menos R$ 0,50, com até duas casas decimais' }) message!: string;
  @ApiPropertyOptional({ example: 'amount', description: 'Campo que causou o erro, quando houver' }) field?: string;
  @ApiPropertyOptional({ example: 'VALOR_NAO_ACEITO', description: 'Motivo registrado no pedido, quando houver' }) reason?: string;
  @ApiPropertyOptional({ type: [String], description: 'Lista de problemas de validação, quando houver' }) details?: string[];
}

export class ApiErrorEnvelopeDoc {
  @ApiProperty({ type: ApiErrorDoc }) error!: ApiErrorDoc;
}
