import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CreateDonation, DonationCreationError } from '../../application/create-donation.js';
import { DonationIntentTakenError, DonationOperationConflictError } from '../../ports/donation-creation-repository.js';
import type { AuthenticatedUser } from '../../../auth/guard/authenticated-user.js';
import { CurrentUser } from '../../../auth/guard/current-user.decorator.js';
import { RetryDonation } from '../../application/retry-donation.js';
import { ApiErrorEnvelopeDoc, CreateDonationRequestDoc, DonationOrderEnvelopeDoc } from './donation-api-docs.js';
import {
  DonationAmountRejectedError,
  DonationOperationReusedError,
  DonationOrderNotFoundError,
  DonationServiceUnavailableError,
  InvalidDonationRequestError,
} from './donation-http-errors.js';

const intentHeader = ApiHeader({
  name: 'X-Donation-Intent',
  required: true,
  description: 'Chave de intenção guardada pelo aplicativo; só ela enxerga o pedido',
});
const operationHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'Identidade da operação; repetir a mesma chave devolve o mesmo resultado',
});
const notFound = ApiResponse({ status: 404, description: 'Nenhum pedido seu para esta intenção (pedido de outra pessoa responde igual)', type: ApiErrorEnvelopeDoc });
const uncertain = ApiResponse({ status: 202, description: 'Situação do pagamento incerta; consulte o pedido antes de tentar de novo', type: DonationOrderEnvelopeDoc });
const unavailable = ApiResponse({ status: 503, description: 'Serviço de doações indisponível', type: ApiErrorEnvelopeDoc });

@ApiTags('doações')
// Cadeado na página /docs. A proteção em si é o AuthGuard global; isto só documenta.
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Token ausente, adulterado ou expirado', type: ApiErrorEnvelopeDoc })
@Controller('donation-orders')
export class DonationOrdersController {
  constructor(private readonly createDonation: CreateDonation, private readonly retryDonation: RetryDonation) {}

  @Get('current')
  @ApiOperation({ summary: 'Consulta o pedido de doação atual desta intenção' })
  @intentHeader
  @ApiResponse({ status: 200, description: 'Pedido com tentativas e histórico', type: DonationOrderEnvelopeDoc })
  @notFound
  @uncertain
  @unavailable
  current(@CurrentUser() caller: AuthenticatedUser, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.respond(response, () => this.retryDonation.inspectCurrent(caller.sub, request.header('X-Donation-Intent')));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um pedido de doação pelo id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @intentHeader
  @ApiResponse({ status: 200, description: 'Pedido com tentativas e histórico', type: DonationOrderEnvelopeDoc })
  @notFound
  @uncertain
  @unavailable
  get(@CurrentUser() caller: AuthenticatedUser, @Param('id') id: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.respond(response, () => this.retryDonation.inspect(caller.sub, id, request.header('X-Donation-Intent')));
  }

  @Post(':id/attempts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre uma nova tentativa de pagamento para um pedido recusado ou expirado' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @intentHeader
  @operationHeader
  @ApiResponse({ status: 200, description: 'Pedido com a nova tentativa e a URL do Checkout', type: DonationOrderEnvelopeDoc })
  @notFound
  @ApiResponse({ status: 409, description: 'Idempotency-Key já usada em outra operação', type: ApiErrorEnvelopeDoc })
  @uncertain
  @unavailable
  retry(@CurrentUser() caller: AuthenticatedUser, @Param('id') id: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.respond(response, () =>
      this.retryDonation.retry(caller.sub, id, request.header('X-Donation-Intent'), request.header('Idempotency-Key')));
  }

  @Post()
  @ApiOperation({ summary: 'Cria um pedido de doação e abre o Checkout do Stripe' })
  @intentHeader
  @operationHeader
  @ApiBody({ type: CreateDonationRequestDoc, examples: {
    valido: { summary: 'Doação de R$ 10,00', value: { amount: '10.00', currency: 'BRL' } },
  } })
  @ApiResponse({ status: 201, description: 'Pedido criado, com a URL do Checkout', type: DonationOrderEnvelopeDoc })
  @ApiResponse({ status: 200, description: 'Mesma operação repetida: devolve o pedido já criado', type: DonationOrderEnvelopeDoc })
  @ApiResponse({ status: 409, description: 'Idempotency-Key já usada com outro valor, ou chave de intenção que pertence a outro pedido', type: ApiErrorEnvelopeDoc })
  @ApiResponse({ status: 422, description: 'Valor ou moeda inválidos, ou valor recusado pelo Stripe (VALOR_NAO_ACEITO)', type: ApiErrorEnvelopeDoc })
  @uncertain
  @unavailable
  create(@CurrentUser() caller: AuthenticatedUser, @Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.respond(response, async () => {
      const result = await this.createDonation.execute({
        intent: request.header('X-Donation-Intent'),
        operation: request.header('Idempotency-Key'),
        ownerId: caller.sub,
      }, body);
      response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
      return result.donation;
    });
  }

  /** Executa o caso de uso e traduz o resultado para o contrato HTTP da história. */
  private async respond<T>(response: Response, action: () => Promise<T | null>): Promise<T | Record<string, unknown>> {
    try {
      const donation = await action();
      if (!donation) throw new DonationOrderNotFoundError();
      return donation;
    } catch (error) {
      if (error instanceof DonationCreationError && error.code === 'result_uncertain') {
        // Não é falha: o pedido existe, mas a abertura não pôde ser confirmada (CA4).
        response.status(HttpStatus.ACCEPTED);
        return error.details;
      }
      return this.failure(error);
    }
  }

  private failure(error: unknown): never {
    if (error instanceof DonationOrderNotFoundError) throw error;
    if (error instanceof DonationOperationConflictError) throw new DonationOperationReusedError(error.message);
    // Sem dados do pedido existente: dizer de quem é ou quanto vale vazaria o pedido de outra pessoa.
    if (error instanceof DonationIntentTakenError) throw new DonationOperationReusedError(error.message);
    if (error instanceof DonationCreationError) {
      if (error.code === 'invalid_input') {
        throw new InvalidDonationRequestError(error.message, typeof error.details.field === 'string' ? error.details.field : undefined);
      }
      if (error.code === 'gateway_rejected_amount') throw new DonationAmountRejectedError(error.details);
      if (error.code === 'service_unavailable' || error.code === 'stripe_unavailable') {
        throw new DonationServiceUnavailableError(error.details);
      }
    }
    throw new DonationServiceUnavailableError();
  }
}
