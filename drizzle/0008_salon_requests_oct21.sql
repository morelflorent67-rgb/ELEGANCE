ALTER TABLE "salon_settings" ALTER COLUMN "salon_slot_step_minutes" SET DEFAULT 30;--> statement-breakpoint
ALTER TABLE "salon_settings" ALTER COLUMN "change_cutoff_hours" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "salon_settings" ALTER COLUMN "max_upcoming_per_customer" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "salon_settings" ALTER COLUMN "reminder_hours" SET DEFAULT 24;--> statement-breakpoint
-- Demandes du salon du 21 octobre 2026 (D-63 à D-67) : la ligne de réglages existante prend les nouvelles valeurs.
UPDATE "salon_settings" SET "salon_slot_step_minutes" = 30, "change_cutoff_hours" = 1, "max_upcoming_per_customer" = 5, "reminder_hours" = 24;--> statement-breakpoint
UPDATE "salon_settings" SET "review_url" = 'https://g.page/r/CV_HUH2O58tMEAE/review';
