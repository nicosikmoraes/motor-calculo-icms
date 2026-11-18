import { ApiProperty } from '@nestjs/swagger';

export class PublicUserDoc {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ana@example.com' }) email!: string;
  @ApiProperty({ enum: ['SUPPORTER', 'ADMIN'], example: 'SUPPORTER' }) role!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PublicUserEnvelopeDoc {
  @ApiProperty({ type: PublicUserDoc }) data!: PublicUserDoc;
}
