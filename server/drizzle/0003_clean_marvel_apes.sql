ALTER TABLE "groups" ADD COLUMN "fund_account_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_fund_account_id_accounts_id_fk" FOREIGN KEY ("fund_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
