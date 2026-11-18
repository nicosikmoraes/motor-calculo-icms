import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { USER_REPOSITORY } from '../src/auth/ports/user-repository.js';
import { PASSWORD_HASHER } from '../src/auth/application/password-hasher.js';
import { BcryptPasswordHasher } from '../src/auth/adapters/bcrypt/bcrypt-password-hasher.js';
import { InMemoryUsers } from './support/in-memory-users.js';
import { testToken } from './support/auth.js';

/** As únicas rotas abertas da API (spec da US10). Abrir outra é um ato explícito que precisa passar por aqui. */
const PUBLIC_ROUTES = [
  'GET /',
  'GET /donations/return',
  'POST /auth/login',
  'POST /auth/register',
  'POST /webhooks/stripe',
];

describe('Tranca global da API', () => {
  let app: INestApplication<Server>;
  let users: InMemoryUsers;

  beforeEach(async () => {
    users = new InMemoryUsers();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY).useValue(users)
      .overrideProvider(PASSWORD_HASHER).useValue(new BcryptPasswordHasher(4))
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  const http = () => request(app.getHttpServer());

  async function signedIn() {
    await http().post('/auth/register').send({ email: 'ana@example.test', password: 'senha-certa' }).expect(201);
    const login = await http().post('/auth/login').send({ email: 'ana@example.test', password: 'senha-certa' }).expect(200);
    return login.body.data.accessToken as string;
  }

  describe('GET /auth/me', () => {
    it('CA8: com token válido devolve quem está chamando, sem o hash', async () => {
      const token = await signedIn();
      const response = await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

      expect(response.body.data).toEqual({ id: users.rows[0].id, email: 'ana@example.test', role: 'SUPPORTER', createdAt: expect.any(String) });
      expect(JSON.stringify(response.body)).not.toMatch(/password|\$2b\$/i);
    });

    it('responde 401 se o token é válido mas o usuário não existe mais', async () => {
      await http().get('/auth/me').set('Authorization', `Bearer ${testToken({ sub: randomUUID() })}`).expect(401);
    });
  });

  describe('CA6: sem credencial utilizável → 401, e a rota não executa', () => {
    it.each([
      ['sem cabeçalho', undefined],
      ['outro esquema', 'Basic YW5hOnNlbmhh'],
      ['Bearer vazio', 'Bearer '],
      ['só a palavra Bearer', 'Bearer'],
      ['token sem esquema', testToken()],
    ])('%s', async (_case, header) => {
      const findById = vi.spyOn(users, 'findById');
      const call = http().get('/auth/me');
      if (header !== undefined) call.set('Authorization', header);
      const response = await call.expect(401);

      expect(response.body).toEqual({ error: { statusCode: 401, message: 'Não autenticado' } });
      expect(findById).not.toHaveBeenCalled();
    });
  });

  describe('CA7: token inválido → 401', () => {
    it('com um caractere trocado', async () => {
      const token = await signedIn();
      const [header, payload, signature] = token.split('.');
      const middle = Math.floor(signature.length / 2);
      const swapped = signature[middle] === 'A' ? 'B' : 'A';
      const tampered = [header, payload, signature.slice(0, middle) + swapped + signature.slice(middle + 1)].join('.');

      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      await http().get('/auth/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });

    it('com o conteúdo alterado para outro papel, mantendo a assinatura', async () => {
      const token = await signedIn();
      const [header, payload, signature] = token.split('.');
      const forged = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'ADMIN' };
      const tampered = [header, Buffer.from(JSON.stringify(forged)).toString('base64url'), signature].join('.');
      await http().get('/auth/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });

    it('assinado com outro segredo (recusado pelo Guard, antes de consultar o usuário)', async () => {
      await signedIn();
      const findById = vi.spyOn(users, 'findById');
      const token = testToken({ sub: users.rows[0].id }, 'outro-segredo-qualquer-com-mais-de-32-caracteres');
      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      // Rota protegida que não consulta usuário: o 401 só pode ter vindo da assinatura.
      await http().get('/donation-orders/current').set('Authorization', `Bearer ${token}`).expect(401);
      expect(findById).not.toHaveBeenCalled();
    });

    it('sem exp (um token eterno não é aceito, mesmo com a assinatura certa)', async () => {
      await signedIn();
      const findById = vi.spyOn(users, 'findById');
      const eternal = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: users.rows[0].id, role: 'SUPPORTER' });
      await http().get('/auth/me').set('Authorization', `Bearer ${eternal}`).expect(401);
      expect(findById).not.toHaveBeenCalled();
    });

    it('já expirado', async () => {
      await signedIn();
      const expired = new JwtService({ secret: process.env.JWT_SECRET })
        .sign({ sub: users.rows[0].id, role: 'SUPPORTER', exp: Math.floor(Date.now() / 1000) - 10 });
      await http().get('/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('sem assinatura (alg none)', async () => {
      await signedIn();
      const unsigned = [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: users.rows[0].id, role: 'ADMIN' })).toString('base64url'),
        '',
      ].join('.');
      await http().get('/auth/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });
  });

  it('CA9: toda rota registrada nasce fechada; só as públicas da spec respondem sem token', async () => {
    const routes = registeredRoutes(app);
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);

    const openWithoutToken: string[] = [];
    for (const { method, path } of routes) {
      const url = path.replace(/:[^/]+/g, randomUUID());
      const response = await (http() as any)[method.toLowerCase()](url).send({});
      if (response.status !== 401) openWithoutToken.push(`${method} ${path}`);
    }
    expect(openWithoutToken.sort()).toEqual(PUBLIC_ROUTES);
  });
});

/** Lê do roteador do Express as rotas que o Nest registrou. */
function registeredRoutes(app: INestApplication): Array<{ method: string; path: string }> {
  const router = app.getHttpAdapter().getInstance().router as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  return router.stack.flatMap((layer) => layer.route
    ? Object.keys(layer.route.methods).filter((method) => method !== '_all').map((method) => ({ method: method.toUpperCase(), path: layer.route!.path }))
    : []);
}
