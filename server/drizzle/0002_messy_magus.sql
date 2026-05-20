ALTER TYPE "public"."api_key_provider" ADD VALUE 'openai';--> statement-breakpoint
ALTER TYPE "public"."api_key_provider" ADD VALUE 'anthropic';--> statement-breakpoint
ALTER TYPE "public"."api_key_provider" ADD VALUE 'ollama';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_provider" "api_key_provider",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'user_api_keys'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "user_api_keys" DROP CONSTRAINT "user_api_keys_pkey";--> statement-breakpoint
ALTER TABLE "user_api_keys" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider");--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD COLUMN "endpoint" text;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD COLUMN "model" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
