import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CreateDonation, DonationCreationError, type DonationCreationFailureCode } from '../../application/create-donation.js';
import { DonationOperationConflictError } from '../../ports/donation-creation-repository.js';
import { RetryDonation } from '../../application/retry-donation.js';

const httpStatusByFailure: Record<DonationCreationFailureCode, number> = {
  invalid_input: 422,
  service_unavailable: 503,
  gateway_rejected_amount: 422,
  stripe_unavailable: 503,
  result_uncertain: 202,
};

@Controller('donation-orders')
export class DonationOrdersController {
  constructor(private readonly createDonation: CreateDonation, private readonly retryDonation: RetryDonation) {}

  @Get('current')
  async current(@Req() request: Request, @Res() response: Response) {
    try {
      const donation = await this.retryDonation.inspectCurrent(request.header('X-Donation-Intent'));
      return donation ? response.status(200).json(donation) : response.status(404).json({ message: 'Pedido não encontrado' });
    } catch (error) { return this.failure(error, response); }
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    try {
      const donation = await this.retryDonation.inspect(id, request.header('X-Donation-Intent'));
      return donation ? response.status(200).json(donation) : response.status(404).json({ message: 'Pedido não encontrado' });
    } catch (error) { return this.failure(error, response); }
  }

  @Post(':id/attempts')
  async retry(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    try {
      const donation = await this.retryDonation.retry(id, request.header('X-Donation-Intent'), request.header('Idempotency-Key'));
      return donation ? response.status(200).json(donation) : response.status(404).json({ message: 'Pedido não encontrado' });
    } catch (error) { return this.failure(error, response); }
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown, @Res() response: Response) {
    try {
      const result = await this.createDonation.execute({
        intent: request.header('X-Donation-Intent'),
        operation: request.header('Idempotency-Key'),
      }, body);
      return response.status(result.replayed ? 200 : 201).json(result.donation);
    } catch (error) {
      return this.failure(error, response);
    }
  }

  private failure(error: unknown, response: Response) {
    if (error instanceof DonationOperationConflictError) return response.status(409).json({ message: error.message });
    if (error instanceof DonationCreationError) return response.status(httpStatusByFailure[error.code]).json(error.details);
    throw new HttpException('Serviço de doações indisponível. Tente novamente mais tarde', 503);
  }
}
