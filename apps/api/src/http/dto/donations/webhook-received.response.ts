import { ApiProperty } from '@nestjs/swagger';

export class WebhookReceivedDoc {
  @ApiProperty({ example: true }) received!: true;
}

export class WebhookReceivedEnvelopeDoc {
  @ApiProperty({ type: WebhookReceivedDoc }) data!: WebhookReceivedDoc;
}
