ALTER TABLE "user_preferences" ADD COLUMN "notify_weekly" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "notify_monthly" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "notify_nudge" boolean DEFAULT true NOT NULL;