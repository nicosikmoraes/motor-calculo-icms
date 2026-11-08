BEGIN;

-- Keep existing values exact while removing the DECIMAL(65,2) integer-digit ceiling.
-- PostgreSQL will not change a referenced column's type while the trigger WHEN
-- expression depends on it, so recreate the same immutability trigger in this
-- transaction after the type change.
DROP TRIGGER "donation_order_terms_immutable" ON "donation_orders";

ALTER TABLE "donation_orders"
    ALTER COLUMN "amount" TYPE NUMERIC USING "amount"::numeric;

-- The database accepts arbitrarily large finite numerics, but donations use cents.
ALTER TABLE "donation_orders"
    ADD CONSTRAINT "donation_orders_amount_scale_and_finite"
    CHECK (
        "amount" = trunc("amount", 2)
        AND "amount" <> 'NaN'::numeric
        AND "amount" <> 'Infinity'::numeric
        AND "amount" <> '-Infinity'::numeric
    );

CREATE TRIGGER "donation_order_terms_immutable"
BEFORE UPDATE ON "donation_orders"
FOR EACH ROW
WHEN (OLD."amount" IS DISTINCT FROM NEW."amount" OR OLD."currency" IS DISTINCT FROM NEW."currency")
EXECUTE FUNCTION "reject_donation_order_terms_change"();

COMMIT;
