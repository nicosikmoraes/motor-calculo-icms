import type { JwtService } from '@nestjs/jwt';
import type { AccessTokenIssuer, AccessTokenPayload } from '../../application/access-token-issuer.js';

/** Assina com o segredo e a validade configurados no JwtModule; iat e exp são preenchidos pela biblioteca. */
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync({ sub: payload.sub, role: payload.role });
  }
}
