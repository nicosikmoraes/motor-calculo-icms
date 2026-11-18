CREATE TABLE "donation_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    CONSTRAINT "donation_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "donation_drafts_amount_positive" CHECK ("amount" > 0 AND "amount" <> 'NaN'::numeric),
    CONSTRAINT "donation_drafts_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "donation_drafts_user_id_created_at_id_idx"
    ON "donation_drafts"("user_id", "created_at" DESC, "id" DESC);
