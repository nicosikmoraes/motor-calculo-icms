import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../auth/guard/roles.decorator.js';
import { ADMIN_DONATIONS_QUERY, type AdminDonationOrder, type AdminDonationsQuery } from '../../ports/admin-donations-query.js';
import { AdminDonationOrdersEnvelopeDoc, ApiErrorEnvelopeDoc } from './donation-api-docs.js';

const LIST_LIMIT = 100;

/**
 * Área do mantenedor. O AuthGuard global exige token (401) e o RolesGuard exige ADMIN (403).
 * Não existe rota para promover ninguém: o primeiro ADMIN é promovido à mão, no banco.
 */
@ApiTags('administração')
@ApiBearerAuth('bearer')
@Roles('ADMIN')
@Controller('admin/donation-orders')
export class AdminDonationsController {
  constructor(@Inject(ADMIN_DONATIONS_QUERY) private readonly query: AdminDonationsQuery) {}

  @Get()
  @ApiOperation({ summary: 'Lista os 100 pedidos de doação mais recentes, com o e-mail de quem doou (só ADMIN)' })
  @ApiResponse({ status: 200, description: 'Pedidos mais recentes primeiro; ownerEmail é null para pedido sem dono', type: AdminDonationOrdersEnvelopeDoc })
  @ApiResponse({ status: 401, description: 'Token ausente, adulterado ou expirado', type: ApiErrorEnvelopeDoc })
  @ApiResponse({ status: 403, description: 'Autenticado, mas sem o papel ADMIN', type: ApiErrorEnvelopeDoc })
  async list(): Promise<AdminDonationOrder[]> {
    const rows = await this.query.listRecent(LIST_LIMIT);
    // Só os campos da spec saem daqui, mesmo que a consulta traga mais.
    return rows.map(({ orderId, amount, currency, status, createdAt, ownerEmail }) => ({ orderId, amount, currency, status, createdAt, ownerEmail }));
  }
}
