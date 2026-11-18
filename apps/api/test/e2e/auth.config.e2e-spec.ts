import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';

// CA10: sem JWT_SECRET (ou com um valor fraco), a API não sobe — e não assina nada com um segredo de reserva.
describe('JWT_SECRET na inicialização da API', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function boot() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();
    return app;
  }

  it('falha nomeando a variável quando ela está vazia', async () => {
    vi.stubEnv('JWT_SECRET', '');
    await expect(boot()).rejects.toThrow(/JWT_SECRET/);
  });

  it('falha quando o segredo tem menos de 32 caracteres', async () => {
    vi.stubEnv('JWT_SECRET', 'meusegredo123');
    await expect(boot()).rejects.toThrow(/JWT_SECRET/);
  });

  it('sobe com um segredo de 32 caracteres ou mais', async () => {
    vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
    const app = await boot();
    await app.close();
  });
});
