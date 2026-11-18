import { ApiProperty } from '@nestjs/swagger';

export class DonationDraftDoc {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '25.00' }) amount!: string;
  @ApiProperty({ enum: ['BRL'] }) currency!: 'BRL';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class DonationDraftEnvelopeDoc {
  @ApiProperty({ type: DonationDraftDoc }) data!: DonationDraftDoc;
}

export class DonationDraftListEnvelopeDoc {
  @ApiProperty({ type: [DonationDraftDoc] }) data!: DonationDraftDoc[];
}
