import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, UnauthorizedException, UseInterceptors,
  type CallHandler, type ExecutionContext, type NestInterceptor,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../auth/guard/authenticated-user.js';
import { DonationDraftAccessError } from '../../../donation-drafts/application/donation-draft-access.error.js';
import { ManageDonationDrafts } from '../../../donation-drafts/application/manage-donation-drafts.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { ApiErrorEnvelopeDoc } from '../../dto/api-error.response.js';
import { DonationDraftAmountRequest } from '../../dto/donation-drafts/donation-draft-amount.request.js';
import { DonationDraftEnvelopeDoc, DonationDraftListEnvelopeDoc } from '../../dto/donation-drafts/donation-draft.response.js';

const badRequest = ApiBadRequestResponse({ type: ApiErrorEnvelopeDoc, description: 'Corpo ou ID inválido' });
const notFound = ApiNotFoundResponse({ type: ApiErrorEnvelopeDoc, description: 'Rascunho não encontrado para esta conta' });
const draftId = ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } });

// A transformação de DTO pode descartar chaves especiais antes da whitelist.
const draftBodyFields: NestInterceptor = {
  intercept(context: ExecutionContext, next: CallHandler) {
    const body: unknown = context.switchToHttp().getRequest<Request>().body;
    if (body === null || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => key !== 'amount')) {
      throw new BadRequestException('O corpo deve conter somente o campo amount');
    }
    return next.handle();
  },
};

@ApiTags('rascunhos de doação')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDoc, description: 'Token ausente ou inválido' })
@Controller('donation-drafts')
export class DonationDraftsController {
  constructor(private readonly drafts: ManageDonationDrafts) {}

  @Post()
  @UseInterceptors(draftBodyFields)
  @ApiOperation({ summary: 'Cria um rascunho para a conta autenticada' })
  @ApiCreatedResponse({ type: DonationDraftEnvelopeDoc })
  @badRequest
  create(@CurrentUser() caller: AuthenticatedUser, @Body() body: DonationDraftAmountRequest) {
    return this.respond(this.drafts.create(caller.sub, body.amount));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os rascunhos da conta autenticada' })
  @ApiOkResponse({ type: DonationDraftListEnvelopeDoc })
  list(@CurrentUser() caller: AuthenticatedUser) {
    return this.respond(this.drafts.list(caller.sub));
  }

  @Get(':id')
  @draftId
  @ApiOperation({ summary: 'Consulta um rascunho da conta autenticada' })
  @ApiOkResponse({ type: DonationDraftEnvelopeDoc })
  @badRequest
  @notFound
  get(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.respond(this.drafts.get(caller.sub, id));
  }

  @Patch(':id')
  @draftId
  @UseInterceptors(draftBodyFields)
  @ApiOperation({ summary: 'Atualiza o valor de um rascunho da conta autenticada' })
  @ApiOkResponse({ type: DonationDraftEnvelopeDoc })
  @badRequest
  @notFound
  update(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DonationDraftAmountRequest) {
    return this.respond(this.drafts.update(caller.sub, id, body.amount));
  }

  @Delete(':id')
  @draftId
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui um rascunho da conta autenticada' })
  @ApiNoContentResponse()
  @badRequest
  @notFound
  remove(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.respond(this.drafts.remove(caller.sub, id));
  }

  private async respond<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (!(error instanceof DonationDraftAccessError)) throw error;
      if (error.code === 'account-not-found') throw new UnauthorizedException(error.message);
      throw new NotFoundException(error.message);
    }
  }
}
