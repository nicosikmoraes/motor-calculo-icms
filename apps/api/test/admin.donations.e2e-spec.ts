import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ADMIN_DONATIONS_QUERY } from '../src/donations/ports/admin-donations-query.js';
import { authorization, testToken } from './support/auth.js';

describe('GET /admin/donation-orders', () => {
  let app: INestApplication<Server>;
  const rows = [
    { orderId: randomUUID(), amount: '25.00', currency: 'BRL', status: 'pago', createdAt: new Date('2026-11-17T12:00:00Z'), ownerEmail: 'ana@example.test' },
    { orderId: randomUUID(), amount: '7.00', currency: 'BRL', status: 'pendente', createdAt: new Date('2026-11-01T12:00:00Z'), ownerEmail: null },
  ];
  const query = { listRecent: vi.fn(async () => rows) };

  beforeEach(async () => {
    query.listRecent.mockClear();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADMIN_DONATIONS_QUERY).useValue(query)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  const list = () => request(app.getHttpServer()).get('/admin/donation-orders');

  it('CA1: token de apoiador recebe 403 com a mensagem da spec, e a rota não executa', async () => {
    const response = await list().set(authorization(testToken({ role: 'SUPPORTER' }))).expect(403);
    expect(response.body).toEqual({ error: { statusCode: 403, message: 'Sem permissão para esta ação' } });
    expect(query.listRecent).not.toHaveBeenCalled();
  });

  it.each([
    ['sem token', undefined],
    ['token adulterado', `Bearer ${testToken({ role: 'ADMIN' }).slice(0, -3)}xyz`],
    ['token de ADMIN assinado com outro segredo', `Bearer ${testToken({ role: 'ADMIN' }, 'outro-segredo-qualquer-com-mais-de-32-caracteres')}`],
  ])('CA2: %s recebe 401, nunca 403 nem 500', async (_case, header) => {
    const call = list();
    if (header) call.set('Authorization', header);
    const response = await call.expect(401);
    expect(response.body.error.statusCode).toBe(401);
    expect(query.listRecent).not.toHaveBeenCalled();
  });

  it('CA3: token de ADMIN recebe 200 com os 100 mais recentes, incluindo pedidos sem dono', async () => {
    const response = await list().set(authorization(testToken({ role: 'ADMIN' }))).expect(200);
    expect(query.listRecent).toHaveBeenCalledWith(100);
    expect(response.body.data).toEqual([
      { orderId: rows[0].orderId, amount: '25.00', currency: 'BRL', status: 'pago', createdAt: '2026-11-17T12:00:00.000Z', ownerEmail: 'ana@example.test' },
      { orderId: rows[1].orderId, amount: '7.00', currency: 'BRL', status: 'pendente', createdAt: '2026-11-01T12:00:00.000Z', ownerEmail: null },
    ]);
  });

  it('CA3: não devolve campo que a consulta trouxer além dos da spec', async () => {
    query.listRecent.mockResolvedValueOnce([{ ...rows[0], intentKeyHash: 'segredo', passwordHash: '$2b$12$x' } as never]);
    const response = await list().set(authorization(testToken({ role: 'ADMIN' }))).expect(200);
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['amount', 'createdAt', 'currency', 'orderId', 'ownerEmail', 'status']);
  });
});
