import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const amountPattern = /^(?!0\.00$)(?:0|[1-9]\d{0,9})\.\d{2}$/u;

export class DonationDraftAmountRequest {
  @ApiProperty({ type: String, example: '25.00', pattern: amountPattern.source, description: 'De 0.01 a 9999999999.99 em BRL' })
  @IsString()
  @Matches(amountPattern, { message: 'informe um valor de 0.01 a 9999999999.99 com duas casas decimais' })
  amount!: string;
}
