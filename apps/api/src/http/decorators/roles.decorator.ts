import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../auth/ports/user-repository.js';

export const ROLES_KEY = 'roles';

/**
 * Exige um dos papéis listados, comparados exatamente: `@Roles('ADMIN')` deixa passar só ADMIN.
 * Rota sem esta marca fica aberta a qualquer pessoa autenticada (estar logado é o padrão;
 * ter um papel específico é a exceção declarada).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
