import type { ConfigService } from '@nestjs/config';

/** Validade do token: 2 horas (decisão e motivo na spec da US10). */
export const JWT_EXPIRES_IN_SECONDS = 7200;

const MIN_SECRET_LENGTH = 32;

/**
 * Lê o segredo do JWT do ambiente. Sem valor de reserva de propósito: se a variável
 * não chegou, a API não sobe — em vez de assinar tokens com um segredo que estaria no repositório.
 */
export function readJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET ausente ou com menos de ${MIN_SECRET_LENGTH} caracteres. Defina-o no .env (veja .env.example).`);
  }
  return secret;
}
