import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';

/** Assina um token de teste com o mesmo segredo descartável que a API recebe no ambiente de teste. */
export function testToken(payload: { sub?: string; role?: 'SUPPORTER' | 'ADMIN' } = {}, secret = process.env.JWT_SECRET): string {
  return new JwtService({ secret }).sign({ sub: payload.sub ?? randomUUID(), role: payload.role ?? 'SUPPORTER' }, { expiresIn: 7200 });
}

/** Cabeçalho pronto para o supertest: `.set(authorization())`. */
export function authorization(token = testToken()): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
