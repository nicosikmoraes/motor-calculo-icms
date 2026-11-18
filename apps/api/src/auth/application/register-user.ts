import type { PasswordHasher } from './password-hasher.js';
import { normalizeEmail } from './normalize-email.js';
import type { PublicUser, UserRepository } from '../ports/user-repository.js';

export interface RegisterUserInput {
  email: string;
  password: string;
}

export class RegisterUser {
  constructor(private readonly users: UserRepository, private readonly hasher: PasswordHasher) {}

  /** Só e-mail e senha entram; o papel é fixado pelo repositório como SUPPORTER. */
  async execute({ email, password }: RegisterUserInput): Promise<PublicUser> {
    const passwordHash = await this.hasher.hash(password);
    const user = await this.users.create({ email: normalizeEmail(email), passwordHash });
    // Mesmo que o repositório devolva mais campos, só estes saem daqui.
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }
}
