ALTER TABLE "payments"
ADD COLUMN "checkout_parameters" JSONB;

ALTER TABLE "payments"
ADD COLUMN "checkout_url" TEXT;
