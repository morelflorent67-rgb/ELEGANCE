ALTER TABLE "payment" ALTER COLUMN "appointment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_target" CHECK ("payment"."appointment_id" is not null or "payment"."staff_id" is not null);--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_label_length" CHECK (char_length("payment"."label") <= 60);