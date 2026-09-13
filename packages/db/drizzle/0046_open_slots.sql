CREATE TYPE "public"."open_slot_status" AS ENUM('OPEN', 'OFFERED', 'FILLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."slot_interest_response" AS ENUM('INTERESTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."slot_offer_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "open_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period_month" text NOT NULL,
	"business_date" date NOT NULL,
	"template_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"status" "open_slot_status" DEFAULT 'OPEN' NOT NULL,
	"filled_employee_id" uuid,
	"filled_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_slots_filled_consistent" CHECK (("open_slots"."status" = 'FILLED') = ("open_slots"."filled_employee_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "slot_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"response" "slot_interest_response" NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"status" "slot_offer_status" DEFAULT 'OPEN' NOT NULL,
	"notified_count" integer DEFAULT 0 NOT NULL,
	"offered_by" uuid,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_filled_employee_id_employees_id_fk" FOREIGN KEY ("filled_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_slots" ADD CONSTRAINT "open_slots_filled_version_id_schedule_versions_id_fk" FOREIGN KEY ("filled_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_interests" ADD CONSTRAINT "slot_interests_offer_id_slot_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."slot_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_interests" ADD CONSTRAINT "slot_interests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_slot_id_open_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."open_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_slots_scope_idx" ON "open_slots" USING btree ("site_id","org_unit_id","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_interests_offer_employee_uq" ON "slot_interests" USING btree ("offer_id","employee_id");--> statement-breakpoint
CREATE INDEX "slot_offers_slot_idx" ON "slot_offers" USING btree ("slot_id");