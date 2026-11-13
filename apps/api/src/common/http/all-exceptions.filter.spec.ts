import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, Logger, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

/** Erro com a mesma forma do que o Prisma lança, com detalhes internos que não podem vazar. */
function prismaKnownError(code: string): Error {
  const error = new Error(
    'Invalid `tx.payment.create()` invocation: Unique constraint failed on the fields: (`checkout_session_id`) '
    + 'in table "payments" — SELECT "public"."payments"."id" FROM "public"."payments"',
  ) as Error & { code: string; meta: unknown };
  error.name = 'PrismaClientKnownRequestError';
  error.code = code;
  error.meta = { modelName: 'Payment', target: ['checkout_session_id'] };
  return error;
}

function callFilter(exception: unknown) {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/donation-orders' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  const [[status]] = response.status.mock.calls;
  const [[body]] = response.json.mock.calls;
  return { status: status as number, body: body as { error: Record<string, unknown> }, text: JSON.stringify(body) };
}

describe('AllExceptionsFilter', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  let warnLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnLog = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('transforma P2002 (registro duplicado) em 409 sem repassar tabela, coluna ou consulta', () => {
    const { status, body, text } = callFilter(prismaKnownError('P2002'));

    expect(status).toBe(409);
    expect(body).toEqual({ error: { statusCode: 409, message: 'Já existe um registro com esses dados' } });
    for (const leak of ['payments', 'checkout_session_id', 'SELECT', 'invocation', 'Payment']) expect(text).not.toContain(leak);
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('P2002'));
  });

  it('transforma P2025 (registro inexistente ao atualizar ou apagar) em 404 sem detalhe interno', () => {
    const { status, body, text } = callFilter(prismaKnownError('P2025'));

    expect(status).toBe(404);
    expect(body).toEqual({ error: { statusCode: 404, message: 'Registro não encontrado' } });
    expect(text).not.toContain('payments');
  });

  it('devolve 500 genérico para erro inesperado e deixa o detalhe só no log', () => {
    const { status, body, text } = callFilter(new Error('connect ECONNREFUSED 127.0.0.1:5432 password=app'));

    expect(status).toBe(500);
    expect(body).toEqual({ error: { statusCode: 500, message: 'Erro interno' } });
    expect(text).not.toContain('ECONNREFUSED');
    expect(errorLog).toHaveBeenCalledWith('POST /donation-orders', expect.stringContaining('ECONNREFUSED'));
  });

  it('trata código Prisma desconhecido como erro inesperado, sem vazar a mensagem do banco', () => {
    const { status, text } = callFilter(prismaKnownError('P2003'));

    expect(status).toBe(500);
    expect(text).not.toContain('payments');
  });

  it('mantém o código e os campos que um erro HTTP nomeado declarou', () => {
    const { status, body } = callFilter(new UnprocessableEntityException({ message: 'Valor inválido', field: 'amount' }));

    expect(status).toBe(422);
    expect(body).toEqual({ error: { statusCode: 422, message: 'Valor inválido', field: 'amount' } });
  });

  it('dá o mesmo formato à lista de problemas do ValidationPipe', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    class Body { declare amount: string; }
    let failure: unknown;
    try {
      await pipe.transform({ amount: '1', extra: true }, { type: 'body', metatype: Body });
    } catch (error) { failure = error; }

    expect(failure).toBeInstanceOf(BadRequestException);
    const { status, body } = callFilter(failure);
    expect(status).toBe(400);
    expect(body.error).toMatchObject({ statusCode: 400, message: 'Requisição inválida', details: expect.any(Array) });
  });
});
