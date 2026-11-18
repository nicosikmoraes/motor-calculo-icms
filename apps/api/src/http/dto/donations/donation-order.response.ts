import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
