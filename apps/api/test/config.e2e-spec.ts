import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Configuração da API', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('disponibiliza o ConfigService global e respeita o ambiente do processo', async () => {
    const url = 'postgresql://app:app@127.0.0.1:5433/appdb?schema=public';
    vi.stubEnv('DATABASE_URL', url);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    try {
      expect(module.get(ConfigService).get('DATABASE_URL')).toBe(url);
    } finally {
      await module.close();
    }
  });
});
