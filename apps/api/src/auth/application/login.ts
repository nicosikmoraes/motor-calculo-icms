import { JWT_EXPIRES_IN_SECONDS } from '../auth-config.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { AccessTokenIssuer } from './access-token-issuer.js';
import { normalizeEmail } from './normalize-email.js';
import type { PasswordHasher } from './password-hasher.js';

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** A mesma mensagem para e-mail inexistente e senha errada: o login não revela quais e-mails existem. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('E-mail ou senha inválidos');
    this.name = 'InvalidCredentialsError';
  }
}

export class Login {
  /**
   * @param dummyHash hash de uma senha aleatória, gerado na inicialização. Quando o e-mail
   *   não existe, a senha é comparada com ele, para o tempo de resposta ser o mesmo dos dois casos.
   */
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AccessTokenIssuer,
    private readonly dummyHash: string,
  ) {}

  async execute({ email, password }: { email: string; password: string }): Promise<LoginResult> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    const matches = await this.hasher.compare(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !matches) throw new InvalidCredentialsError();

    const accessToken = await this.tokens.sign({ sub: user.id, role: user.role });
    return { accessToken, tokenType: 'Bearer', expiresIn: JWT_EXPIRES_IN_SECONDS };
  }
}
