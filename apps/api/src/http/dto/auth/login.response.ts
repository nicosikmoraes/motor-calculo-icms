import { ApiProperty } from '@nestjs/swagger';

export class LoginResultDoc {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }) accessToken!: string;
  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] }) tokenType!: 'Bearer';
  @ApiProperty({ example: 7200, description: 'Validade do token em segundos (2 horas)' }) expiresIn!: number;
}

export class LoginResultEnvelopeDoc {
  @ApiProperty({ type: LoginResultDoc }) data!: LoginResultDoc;
}
