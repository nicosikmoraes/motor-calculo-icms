/** E-mail comparável: sem espaços nas pontas e em minúsculas, para gravar e para buscar. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
