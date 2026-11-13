import { HttpException, HttpStatus } from '@nestjs/common';

/** Nenhum pedido visível para esta intenção (ou o pedido pertence a outra). */
export class DonationOrderNotFoundError extends HttpException {
  constructor() {
    super({ message: 'Pedido não encontrado' }, HttpStatus.NOT_FOUND);
  }
}

/** A mesma `Idempotency-Key` foi reaproveitada com outro valor ou outra operação. */
export class DonationOperationReusedError extends HttpException {
  constructor(message: string) {
    super({ message }, HttpStatus.CONFLICT);
  }
}

/** Valor, moeda ou identidade da doação fora das regras da história (CA2). */
export class InvalidDonationRequestError extends HttpException {
  constructor(message: string, field?: string) {
    super(field ? { message, field } : { message }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** O Stripe recusou o valor; o pedido fica registrado com o motivo `VALOR_NAO_ACEITO`. */
export class DonationAmountRejectedError extends HttpException {
  constructor(details: Record<string, unknown>) {
    super({ ...details, message: String(details.message ?? 'Valor não aceito pelo serviço de pagamentos') },
      HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** Banco, configuração ou Stripe indisponíveis; nenhuma cobrança nova foi aberta. */
export class DonationServiceUnavailableError extends HttpException {
  constructor() {
    super({ message: 'Serviço de doações indisponível. Tente novamente mais tarde' }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
