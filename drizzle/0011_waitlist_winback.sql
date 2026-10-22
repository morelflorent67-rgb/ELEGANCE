CREATE TYPE "public"."waitlist_entry_status" AS ENUM('active', 'fulfilled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_offer_status" AS ENUM('pending', 'accepted', 'declined', 'expired', 'lost');--> statement-breakpoint
CREATE TYPE "public"."waitlist_window" AS ENUM('morning', 'afternoon', 'day');--> statement-breakpoint
ALTER TYPE "public"."email_type" ADD VALUE 'waitlist_offer';--> statement-breakpoint
ALTER TYPE "public"."email_type" ADD VALUE 'winback';--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_ids" uuid[] NOT NULL,
	"staff_id" uuid,
	"days" date[] NOT NULL,
	"window" "waitlist_window" NOT NULL,
	"status" "waitlist_entry_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entry_days" CHECK (cardinality("waitlist_entry"."days") between 1 and 14),
	CONSTRAINT "waitlist_entry_services" CHECK (cardinality("waitlist_entry"."service_ids") between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "waitlist_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "waitlist_offer_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_offer_order" CHECK ("waitlist_offer"."ends_at" > "waitlist_offer"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "winback_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "waitlist_hold_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "winback_after_days" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offer" ADD CONSTRAINT "waitlist_offer_entry_id_waitlist_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."waitlist_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offer" ADD CONSTRAINT "waitlist_offer_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offer" ADD CONSTRAINT "waitlist_offer_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entry_active_idx" ON "waitlist_entry" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "waitlist_entry_customer_idx" ON "waitlist_entry" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_offer_one_per_slot" ON "waitlist_offer" USING btree ("staff_id","starts_at") WHERE "waitlist_offer"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_offer_one_per_entry" ON "waitlist_offer" USING btree ("entry_id") WHERE "waitlist_offer"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "waitlist_offer_entry_idx" ON "waitlist_offer" USING btree ("entry_id","status");--> statement-breakpoint
ALTER TABLE "salon_settings" ADD CONSTRAINT "salon_settings_waitlist" CHECK ("salon_settings"."waitlist_hold_minutes" > 0 and "salon_settings"."winback_after_days" > 0);--> statement-breakpoint
-- Comme toutes les tables : aucun accès depuis le navigateur (principe 2, migration 0002).
ALTER TABLE "waitlist_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist_offer" ENABLE ROW LEVEL SECURITY;
