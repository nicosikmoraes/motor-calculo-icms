/** A mesma mensagem para e-mail inexistente e senha errada protege o cadastro dos usuários. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('E-mail ou senha inválidos');
    this.name = 'InvalidCredentialsError';
  }
}
