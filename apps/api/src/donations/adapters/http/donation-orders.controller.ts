import { Body, Controller, HttpException, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CreateDonation, DonationCreationError, type DonationCreationFailureCode } from '../../application/create-donation.js';
import { DonationOperationConflictError } from '../../ports/donation-creation-repository.js';

const httpStatusByFailure: Record<DonationCreationFailureCode, number> = {
  invalid_input: 422,
  service_unavailable: 503,
  gateway_rejected_amount: 422,
  stripe_unavailable: 503,
  result_uncertain: 202,
};

@Controller('donation-orders')
export class DonationOrdersController {
  constructor(private readonly createDonation: CreateDonation) {}

  @Post()
  async create(@Req() request: Request, @Body() body: unknown, @Res() response: Response) {
    try {
      const result = await this.createDonation.execute({
        intent: request.header('X-Donation-Intent'),
        operation: request.header('Idempotency-Key'),
      }, body);
      return response.status(result.replayed ? 200 : 201).json(result.donation);
    } catch (error) {
      if (error instanceof DonationOperationConflictError) return response.status(409).json({ message: error.message });
      if (error instanceof DonationCreationError) {
        return response.status(httpStatusByFailure[error.code]).json(error.details);
      }
      throw new HttpException('Serviço de doações indisponível. Tente novamente mais tarde', 503);
    }
  }
}
