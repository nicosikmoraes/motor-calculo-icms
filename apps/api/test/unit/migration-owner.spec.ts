import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// CA8: a migration da US11 roda por cima de uma tabela com pedidos. Ela não pode exigir dono,
// apagar linhas, inventar valor nem mexer em colunas que não são da história.
it('a migration do dono acrescenta user_id opcional sem tocar nos dados existentes', () => {
  const migrations = join(__dirname, '../../prisma/migrations');
  const folder = readdirSync(migrations).find((name) => name.endsWith('_donation_order_owner'));
  expect(folder).toBeDefined();
  // Só os comandos: os comentários do arquivo explicam o que foi removido e citariam as palavras proibidas.
  const sql = readFileSync(join(migrations, folder!, 'migration.sql'), 'utf8').replace(/^--.*$/gm, '');

  expect(sql).toMatch(/ALTER TABLE "donation_orders" ADD COLUMN\s+"user_id" UUID;/);
  expect(sql).toMatch(/REFERENCES "users"\("id"\) ON DELETE RESTRICT/);
  expect(sql).toMatch(/CREATE INDEX .* ON "donation_orders"\("user_id"\)/);
  expect(sql).not.toMatch(/NOT NULL|DEFAULT|DELETE FROM|^\s*UPDATE |DROP |"amount"/m);
});
