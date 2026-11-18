import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Formato único de todo erro da API. */
export interface ErrorEnvelope {
  error: {
    statusCode: number;
    message: string;
    details?: string[];
    [extra: string]: unknown;
  };
}

/** Erros conhecidos do Prisma que têm um significado HTTP claro. */
const prismaErrors: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Já existe um registro com esses dados' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' },
};

/** Campos que o próprio Nest coloca no corpo de uma HttpException e que não repassamos. */
const reservedFields = new Set(['statusCode', 'message', 'error']);

/**
 * Último destino de qualquer erro: dá a todos o mesmo formato e garante que
 * nenhuma mensagem interna (banco, stack, consulta) chegue ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const route = `${request.method} ${request.url}`;

    // 1. Erros que o Nest já entende (validação, erros nomeados da API) passam com o que eles mesmos declararam.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = fromHttpException(status, exception);
      if (status >= 500) this.logger.error(route, exception.stack);
      else if (status === HttpStatus.UNPROCESSABLE_ENTITY) this.logger.warn(`${route} → ${status}: ${body.error.message}`);
      response.status(status).json(body);
      return;
    }

    // 2. Erros conhecidos do Prisma viram o código certo, com mensagem nossa — nunca a do banco.
    const prismaCode = knownPrismaCode(exception);
    if (prismaCode) {
      const { status, message } = prismaErrors[prismaCode];
      this.logger.warn(`${route} → ${status} (Prisma ${prismaCode})`);
      response.status(status).json({ error: { statusCode: status, message } } satisfies ErrorEnvelope);
      return;
    }

    // 3. Qualquer outro: o detalhe fica no log, para fora vai um 500 genérico.
    this.logger.error(route, exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Erro interno' },
    } satisfies ErrorEnvelope);
  }
}

function fromHttpException(status: number, exception: HttpException): ErrorEnvelope {
  const raw = exception.getResponse();
  if (typeof raw === 'string') return { error: { statusCode: status, message: raw } };

  const body = raw as Record<string, unknown>;
  const extras = Object.fromEntries(Object.entries(body).filter(([key]) => !reservedFields.has(key)));
  if (Array.isArray(body.message)) {
    // O ValidationPipe devolve a lista de problemas; ela vai em `details`.
    return { error: { ...extras, statusCode: status, message: 'Requisição inválida', details: body.message.map(String) } };
  }
  const message = typeof body.message === 'string' ? body.message : exception.message;
  return { error: { ...extras, statusCode: status, message } };
}

function knownPrismaCode(exception: unknown): keyof typeof prismaErrors | null {
  if (!exception || typeof exception !== 'object') return null;
  const { name, code } = exception as { name?: unknown; code?: unknown };
  if (name !== 'PrismaClientKnownRequestError' || typeof code !== 'string') return null;
  return code in prismaErrors ? code : null;
}
