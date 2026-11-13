import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('donations')
export class DonationsReturnController {
  @Get('return')
  show(@Query('result') result: string | undefined, @Res() response: Response) {
    const label = result === 'cancel' ? 'Você voltou do Checkout.' : 'O Checkout foi concluído.';
    return response.type('html').status(200).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContabiliNico — pagamento</title><body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#172033"><h1>${label}</h1><p>Aguardando confirmação do pagamento. Volte ao ContabiliNico e atualize a situação do pedido.</p></body></html>`);
  }
}
