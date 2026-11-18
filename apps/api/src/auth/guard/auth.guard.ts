import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

const ROLES = new Set(['SUPPORTER', 'ADMIN']);

/**
 * Registrado globalmente: roda antes de toda rota. Sem `@Public()`, só passa quem
 * mandar `Authorization: Bearer <token>` com assinatura válida e dentro da validade.
 * Não consulta o banco — a resposta de "quem é" está no token, assinada.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const [scheme, token, ...rest] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || rest.length) throw new UnauthorizedException('Não autenticado');

    let payload: Record<string, unknown>;
    try {
      // O segredo e o algoritmo (só HS256) vêm do JwtModule; exp é conferido aqui.
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException('Não autenticado');
    }
    // Sem exp o jsonwebtoken não confere validade nenhuma: um token assim seria eterno.
    if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string' || typeof payload.role !== 'string' || !ROLES.has(payload.role)) {
      throw new UnauthorizedException('Não autenticado');
    }
    request.user = { sub: payload.sub, role: payload.role as AuthenticatedUser['role'] };
    return true;
  }
}
