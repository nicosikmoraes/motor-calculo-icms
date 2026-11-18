import { JWT_EXPIRES_IN_SECONDS } from '../auth-config.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { AccessTokenIssuer } from './access-token-issuer.js';
import { normalizeEmail } from './normalize-email.js';
import type { PasswordHasher } from './password-hasher.js';

const MAX_BCRYPT_BYTES = 72;

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
    // O bcrypt ignora o que passa de 72 bytes: sem esta checagem, "senha cadastrada + qualquer coisa"
    // entraria. Uma senha assim nunca foi cadastrada, então compara com o hash fictício e recebe o
    // mesmo 401 (sem 400, que revelaria a regra, e no mesmo tempo dos outros casos).
    const tooLong = Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_BYTES;
    const matches = await this.hasher.compare(password, tooLong ? this.dummyHash : user?.passwordHash ?? this.dummyHash);
    if (!user || tooLong || !matches) throw new InvalidCredentialsError();

    const accessToken = await this.tokens.sign({ sub: user.id, role: user.role });
    return { accessToken, tokenType: 'Bearer', expiresIn: JWT_EXPIRES_IN_SECONDS };
  }
}
