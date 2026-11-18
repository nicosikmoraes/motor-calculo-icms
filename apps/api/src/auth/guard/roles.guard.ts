import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../ports/user-repository.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { ROLES_KEY } from '../../http/decorators/roles.decorator.js';

/**
 * Segundo Guard global, depois do AuthGuard: o AuthGuard responde "quem é você" (401),
 * este responde "você pode" (403). Ele lê o papel que o AuthGuard pendurou em `req.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;

    // Sem usuário anexado numa rota que exige papel (ex.: Guards fora de ordem), nega com 403 em vez de quebrar com 500.
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user || !required.includes(user.role)) throw new ForbiddenException('Sem permissão para esta ação');
    return true;
  }
}
