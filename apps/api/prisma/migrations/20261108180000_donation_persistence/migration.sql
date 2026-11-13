BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DonationCurrency" AS ENUM ('BRL');

-- CreateEnum
CREATE TYPE "DonationOrderStatus" AS ENUM ('pendente', 'pago');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pendente', 'recusada', 'expirada', 'falha_na_criacao', 'indeterminada', 'paga');

-- CreateEnum
CREATE TYPE "PaymentEventOrigin" AS ENUM ('webhook', 'gateway', 'api');

-- CreateTable
CREATE TABLE "donation_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intent_key_hash" TEXT NOT NULL,
    "amount" DECIMAL(65,2) NOT NULL,
    "currency" "DonationCurrency" NOT NULL DEFAULT 'BRL',
    "status" "DonationOrderStatus" NOT NULL DEFAULT 'pendente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "donation_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "donation_orders_minimum_amount" CHECK ("amount" >= 0.50 AND "amount" <> 'NaN'::numeric)
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pendente',
    "checkout_session_id" TEXT,
    "payment_intent_id" TEXT,
    "stripe_idempotency_key" TEXT NOT NULL,
    "first_sent_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_operations" (
    "order_id" UUID NOT NULL,
    "operation_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "result_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "donation_operations_pkey" PRIMARY KEY ("order_id","operation_key")
);

-- CreateTable
CREATE TABLE "donation_opening_reservations" (
    "order_id" UUID NOT NULL,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "donation_opening_reservations_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "stripe_event_id" TEXT,
    "origin" "PaymentEventOrigin" NOT NULL,
    "to_status" "PaymentStatus",
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donation_orders_intent_key_hash_key" ON "donation_orders"("intent_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkout_session_id_key" ON "payments"("checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_intent_id_key" ON "payments"("payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_idempotency_key_key" ON "payments"("stripe_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_id_key" ON "payments"("order_id", "id");

-- CreateIndex
CREATE INDEX "donation_operations_order_id_payment_id_idx" ON "donation_operations"("order_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_stripe_event_id_key" ON "payment_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "payment_events_order_id_payment_id_occurred_at_idx" ON "payment_events"("order_id", "payment_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "donation_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_operations" ADD CONSTRAINT "donation_operations_order_id_payment_id_fkey" FOREIGN KEY ("order_id", "payment_id") REFERENCES "payments"("order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_opening_reservations" ADD CONSTRAINT "donation_opening_reservations_order_id_operation_key_fkey" FOREIGN KEY ("order_id", "operation_key") REFERENCES "donation_operations"("order_id", "operation_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_payment_id_fkey" FOREIGN KEY ("order_id", "payment_id") REFERENCES "payments"("order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Imutabilidade dos termos do pedido, inclusive para escritas fora do Prisma.
CREATE FUNCTION "reject_donation_order_terms_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Valor e moeda do pedido de doação são imutáveis.'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "donation_order_terms_immutable"
BEFORE UPDATE ON "donation_orders"
FOR EACH ROW
WHEN (OLD."amount" IS DISTINCT FROM NEW."amount" OR OLD."currency" IS DISTINCT FROM NEW."currency")
EXECUTE FUNCTION "reject_donation_order_terms_change"();

COMMIT;
