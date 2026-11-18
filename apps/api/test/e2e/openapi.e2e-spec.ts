import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module.js';
import { buildOpenApiDocument } from '../../src/http/openapi.js';

// CA11: a página /docs tem o botão Authorize (Bearer) e desenha o cadeado só nas rotas protegidas.
describe('Documento OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    document = buildOpenApiDocument(app);
  });

  afterAll(async () => app.close());

  const security = (path: string, method: 'get' | 'post' | 'patch' | 'delete') => document.paths[path]?.[method]?.security;

  it('declara o esquema Bearer com formato JWT', () => {
    expect(document.components?.securitySchemes?.bearer).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  });

  it.each([
    ['/auth/me', 'get'],
    ['/donation-orders', 'post'],
    ['/donation-orders/current', 'get'],
    ['/donation-orders/{id}', 'get'],
    ['/donation-orders/{id}/attempts', 'post'],
    ['/admin/donation-orders', 'get'],
  ] as const)('%s (%s) aparece com cadeado', (path, method) => {
    expect(security(path, method)).toEqual([{ bearer: [] }]);
  });

  it.each([
    ['/auth/register', 'post'],
    ['/auth/login', 'post'],
    ['/', 'get'],
    ['/webhooks/stripe', 'post'],
    ['/donations/return', 'get'],
  ] as const)('%s (%s) aparece sem cadeado', (path, method) => {
    expect(document.paths[path]?.[method]).toBeDefined();
    expect(security(path, method)).toBeUndefined();
  });

  it('documenta o 401 das rotas protegidas', () => {
    expect(document.paths['/donation-orders/current'].get?.responses['401']).toBeDefined();
  });

  it('CA11: a rota de administrador documenta 401 e 403', () => {
    const responses = document.paths['/admin/donation-orders'].get?.responses ?? {};
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '401', '403']));
  });

  it('US12: documenta as cinco operações autenticadas de rascunhos e seus corpos', () => {
    for (const [path, method, status] of [
      ['/donation-drafts', 'get', '200'],
      ['/donation-drafts', 'post', '201'],
      ['/donation-drafts/{id}', 'get', '200'],
      ['/donation-drafts/{id}', 'patch', '200'],
      ['/donation-drafts/{id}', 'delete', '204'],
    ] as const) {
      expect(security(path, method)).toEqual([{ bearer: [] }]);
      expect(document.paths[path]?.[method]?.responses[status]).toBeDefined();
      expect(document.paths[path]?.[method]?.responses['401']).toBeDefined();
    }
    const schemas = document.components?.schemas;
    expect(schemas?.DonationDraftAmountRequest).toMatchObject({
      required: ['amount'], properties: { amount: { type: 'string', example: '25.00' } },
    });
    expect(document.paths['/donation-drafts/{id}'].delete?.responses['204']).not.toHaveProperty('content');
  });
});

