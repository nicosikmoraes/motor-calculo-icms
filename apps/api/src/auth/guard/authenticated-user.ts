import type { Role } from '../ports/user-repository.js';

/** Quem está chamando, tirado do token já conferido. É o que o AuthGuard pendura em `req.user`. */
export interface AuthenticatedUser {
  sub: string;
  role: Role;
}
