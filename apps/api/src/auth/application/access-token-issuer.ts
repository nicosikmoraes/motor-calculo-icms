/** Validade do token: 2 horas (decisão da US10). */
export const JWT_EXPIRES_IN_SECONDS = 7200;

/** O que vai dentro do token: quem é (sub) e o papel. Nada sigiloso — o conteúdo do JWT é legível. */
export interface AccessTokenPayload {
  sub: string;
  role: 'SUPPORTER' | 'ADMIN';
}

export interface AccessTokenIssuer {
  sign(payload: AccessTokenPayload): Promise<string>;
}

export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
