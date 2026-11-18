import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../../src/http/decorators/roles.decorator.js';
import { RolesGuard } from '../../src/auth/guard/roles.guard.js';

class Routes {
  open() {}
  @Roles('ADMIN') adminOnly() {}
  @Roles('SUPPORTER') supporterOnly() {}
}
@Roles('ADMIN')
class AdminController {
  list() {}
}

function context(target: object, handler: () => void, user?: { sub: string; role: string }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => target.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const routes = new Routes();
  const admin = { sub: 'a', role: 'ADMIN' };
  const supporter = { sub: 's', role: 'SUPPORTER' };

  it('rota sem @Roles: qualquer pessoa autenticada passa', () => {
    expect(guard.canActivate(context(routes, routes.open, supporter))).toBe(true);
  });

  it('com o papel exigido, passa', () => {
    expect(guard.canActivate(context(routes, routes.adminOnly, admin))).toBe(true);
  });

  it('sem o papel exigido, responde 403 com a mensagem da spec', () => {
    const call = () => guard.canActivate(context(routes, routes.adminOnly, supporter));
    expect(call).toThrow(ForbiddenException);
    expect(call).toThrow('Sem permissão para esta ação');
  });

  it('a comparação é exata: ADMIN não passa numa rota @Roles(SUPPORTER)', () => {
    expect(() => guard.canActivate(context(routes, routes.supporterOnly, admin))).toThrow(ForbiddenException);
  });

  it('lê a marca também na classe', () => {
    const controller = new AdminController();
    expect(guard.canActivate(context(controller, controller.list, admin))).toBe(true);
    expect(() => guard.canActivate(context(controller, controller.list, supporter))).toThrow(ForbiddenException);
  });

  it('numa rota com @Roles e sem usuário anexado, responde 403 e nunca quebra com 500', () => {
    expect(() => guard.canActivate(context(routes, routes.adminOnly, undefined))).toThrow(ForbiddenException);
  });
});
