import type { PrismaClient } from '../../../generated/prisma/client.js';
import { EmailAlreadyRegisteredError, type NewUser, type PublicUser, type UserRecord, type UserRepository } from '../../ports/user-repository.js';

/** Campos que podem sair do banco para fora do módulo: o hash nem é lido. */
const publicFields = { id: true, email: true, role: true, createdAt: true } as const;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email }, select: { ...publicFields, passwordHash: true } });
  }

  async findById(id: string): Promise<PublicUser | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return this.prisma.user.findUnique({ where: { id }, select: publicFields });
  }

  async create(user: NewUser): Promise<PublicUser> {
    try {
      // role fica com o padrão do banco (SUPPORTER): nada do corpo da requisição chega aqui.
      return await this.prisma.user.create({ data: { email: user.email, passwordHash: user.passwordHash }, select: publicFields });
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2002') throw new EmailAlreadyRegisteredError();
      throw error;
    }
  }
}
