import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Formato único de toda resposta de sucesso da API. */
export interface Envelope<T> {
  data: T;
}

/**
 * Embrulha em `{ data }` o que cada rota devolve. Rotas que escrevem a resposta
 * por conta própria com `@Res()` (como a página HTML de retorno do Checkout)
 * não passam por aqui.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
