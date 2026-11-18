import bcrypt from 'bcrypt';
import type { PasswordHasher } from '../../application/password-hasher.js';

/**
 * bcrypt é lento de propósito (custo 12 ≈ 2^12 rodadas), e é isso que inviabiliza
 * testar milhões de senhas. O salt é gerado por hash e vai dentro dele.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 12) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
