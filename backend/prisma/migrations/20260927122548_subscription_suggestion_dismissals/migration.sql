-- CreateTable
CREATE TABLE "subscription_suggestion_dismissals" (
    "user_id" UUID NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "dismissed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_suggestion_dismissals_pkey" PRIMARY KEY ("user_id","merchant_key")
);

-- AddForeignKey
ALTER TABLE "subscription_suggestion_dismissals" ADD CONSTRAINT "subscription_suggestion_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
