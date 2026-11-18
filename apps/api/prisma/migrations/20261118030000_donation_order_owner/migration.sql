-- US11: dono do pedido de doação (relação 1:N users → donation_orders).
-- Roda por cima de uma tabela com pedidos: a coluna é opcional, sem valor padrão,
-- e nenhuma linha é apagada ou alterada. Pedidos antigos ficam sem dono (user_id nulo).
-- O Prisma também gerou "ALTER COLUMN amount SET DATA TYPE numeric" (falso diff de
-- Unsupported("numeric")); foi removido por não pertencer à história.

-- AlterTable
ALTER TABLE "donation_orders" ADD COLUMN     "user_id" UUID;

-- CreateIndex
CREATE INDEX "donation_orders_user_id_idx" ON "donation_orders"("user_id");

-- AddForeignKey
ALTER TABLE "donation_orders" ADD CONSTRAINT "donation_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
