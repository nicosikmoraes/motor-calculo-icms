import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';
import { buildOpenApiDocument } from '../src/openapi.js';

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

  const security = (path: string, method: 'get' | 'post') => document.paths[path]?.[method]?.security;

  it('declara o esquema Bearer com formato JWT', () => {
    expect(document.components?.securitySchemes?.bearer).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  });

  it.each([
    ['/auth/me', 'get'],
    ['/donation-orders', 'post'],
    ['/donation-orders/current', 'get'],
    ['/donation-orders/{id}', 'get'],
    ['/donation-orders/{id}/attempts', 'post'],
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
});
