import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminDonationOrderDoc {
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty({ example: '25.00' }) amount!: string;
  @ApiProperty({ example: 'BRL' }) currency!: 'BRL';
  @ApiProperty({ example: 'pago', enum: ['pendente', 'pago'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ nullable: true, example: 'ana@example.com', description: 'null para pedido antigo, sem dono' }) ownerEmail!: string | null;
}

export class AdminDonationOrdersEnvelopeDoc {
  @ApiProperty({ type: [AdminDonationOrderDoc] }) data!: AdminDonationOrderDoc[];
}
