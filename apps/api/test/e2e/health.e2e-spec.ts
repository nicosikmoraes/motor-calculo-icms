import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';

describe('Saúde da API', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET / informa que o processo está no ar', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ data: { status: 'ok' } });
  });

  it('responde 404 para uma rota inexistente', () => {
    return request(app.getHttpServer()).get('/missing').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
