export type Role = 'SUPPORTER' | 'ADMIN';

/** O que pode sair da API sobre um usuário. Não tem — e não pode ganhar — o hash. */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

/** Uso interno do login: é a única leitura que traz o hash. */
export interface UserRecord extends PublicUser {
  passwordHash: string;
}

/** O papel não está aqui de propósito: quem grava decide, e grava SUPPORTER. */
export interface NewUser {
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<PublicUser | null>;
  /** Lança EmailAlreadyRegisteredError se o e-mail já existe (inclusive em corrida). */
  create(user: NewUser): Promise<PublicUser>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('E-mail já cadastrado');
    this.name = 'EmailAlreadyRegisteredError';
  }
}
