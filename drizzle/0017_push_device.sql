CREATE TABLE "push_device" (
	"token" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_device_customer_idx" ON "push_device" USING btree ("customer_id");
--> statement-breakpoint
ALTER TABLE "push_device" ENABLE ROW LEVEL SECURITY;