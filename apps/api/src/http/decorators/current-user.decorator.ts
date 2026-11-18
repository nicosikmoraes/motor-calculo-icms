import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/guard/authenticated-user.js';

/** Entrega à rota o usuário que o AuthGuard anexou à requisição. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser =>
  context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user);
