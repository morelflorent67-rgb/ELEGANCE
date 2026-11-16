CREATE TYPE "public"."loyalty_entry_kind" AS ENUM('earn', 'reversal', 'redeem', 'redeem_cancel', 'adjust');--> statement-breakpoint
CREATE TABLE "loyalty_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" "loyalty_entry_kind" NOT NULL,
	"points" integer NOT NULL,
	"discount_cents" integer,
	"previous_adjusted_cents" integer,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_entry_points" CHECK ("loyalty_entry"."points" <> 0),
	CONSTRAINT "loyalty_entry_adjust_reason" CHECK ("loyalty_entry"."kind" <> 'adjust' or char_length(btrim("loyalty_entry"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "loyalty_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "loyalty_reward_threshold" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "loyalty_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "loyalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "loyalty_reward_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_entry" ADD CONSTRAINT "loyalty_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entry" ADD CONSTRAINT "loyalty_entry_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_entry_customer_idx" ON "loyalty_entry" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_entry_appointment_idx" ON "loyalty_entry" USING btree ("appointment_id");--> statement-breakpoint
ALTER TABLE "salon_settings" ADD CONSTRAINT "salon_settings_loyalty" CHECK ("salon_settings"."loyalty_reward_threshold" > 0);--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_loyalty_points" CHECK ("service"."loyalty_points" >= 0);
--> statement-breakpoint
ALTER TABLE "loyalty_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- R-100 : le solde d'un client ne descend jamais sous 0, quelle que soit l'écriture qui le provoque.
CREATE FUNCTION "loyalty_entry_check_balance"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT coalesce(sum("points"), 0) FROM "loyalty_entry" WHERE "customer_id" = NEW."customer_id") < 0 THEN
    RAISE EXCEPTION 'loyalty balance cannot be negative' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "loyalty_entry_balance" AFTER INSERT ON "loyalty_entry"
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "loyalty_entry_check_balance"();--> statement-breakpoint
-- D-114 : barème de départ de la carte de fidélité (réglable ensuite par le gérant). Seulement la carte d'origine.
UPDATE "service" SET "loyalty_points" = 10 WHERE "id" IN (
  '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000b06',
  '00000000-0000-4000-8000-000000000b07', '00000000-0000-4000-8000-000000000b08', '00000000-0000-4000-8000-000000000b09',
  '00000000-0000-4000-8000-000000000b10');--> statement-breakpoint
UPDATE "service" SET "loyalty_points" = 5 WHERE "id" IN (
  '00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000000b04', '00000000-0000-4000-8000-000000000b05');--> statement-breakpoint
UPDATE "service" SET "loyalty_reward_eligible" = true WHERE "id" IN (
  '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000b02');
