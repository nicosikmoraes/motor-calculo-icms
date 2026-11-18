import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/** Cria um usuário real (a FK de donation_orders.user_id exige que o dono exista). */
export async function createDbUser(pool: Pool, role: 'SUPPORTER' | 'ADMIN' = 'SUPPORTER'): Promise<{ id: string; email: string }> {
  const email = `teste-${randomUUID()}@example.test`;
  const { rows } = await pool.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash-de-teste', $2::"Role") RETURNING id::text`, [email, role]);
  return { id: rows[0].id, email };
}

/** Remove os usuários criados, depois de os pedidos deles terem sido apagados. */
export async function deleteDbUsers(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}
