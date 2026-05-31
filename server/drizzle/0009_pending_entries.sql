CREATE TABLE IF NOT EXISTS "pending_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"line_group_id" text,
	"mode" text NOT NULL,
	"step" text NOT NULL,
	"draft" jsonb NOT NULL,
	"ai_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_entries" ADD CONSTRAINT "pending_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_entries" ADD CONSTRAINT "pending_entries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_entries_user_idx" ON "pending_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_entries_expires_idx" ON "pending_entries" USING btree ("expires_at");
