import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
