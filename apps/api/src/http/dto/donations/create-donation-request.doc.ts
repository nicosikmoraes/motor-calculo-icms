import { ApiProperty } from '@nestjs/swagger';

// Documentação OpenAPI. A validação do corpo é feita no caso de uso, que devolve 422.

export class CreateDonationRequestDoc {
  @ApiProperty({ example: '10.00', description: 'Valor em reais, texto com até duas casas decimais (mínimo R$ 0,50)' })
  amount!: string;

  @ApiProperty({ example: 'BRL', enum: ['BRL'] })
  currency!: 'BRL';
}
