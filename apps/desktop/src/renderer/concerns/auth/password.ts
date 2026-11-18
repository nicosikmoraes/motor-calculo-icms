/** Confere no formulário o mesmo limite de bytes UTF-8 usado no cadastro. */
export function passwordProblem(password: string): string | null {
  const bytes = new TextEncoder().encode(password).length
  if (bytes < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (bytes > 72) return 'A senha pode ter no máximo 72 caracteres (letras acentuadas contam como 2).'
  return null
}
