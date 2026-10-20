ALTER TABLE "customer" ADD COLUMN "review_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "review_url" text;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD CONSTRAINT "salon_settings_review_url" CHECK ("salon_settings"."review_url" is null or "salon_settings"."review_url" ~ '^https?://[^ ]+$');