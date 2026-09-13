CREATE TYPE "public"."note_audience" AS ENUM('PLANNERS', 'EMPLOYEES');--> statement-breakpoint
CREATE TABLE "schedule_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period_month" text NOT NULL,
	"business_date" date,
	"zone_id" uuid,
	"employee_id" uuid,
	"audience" "note_audience" DEFAULT 'PLANNERS' NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_notes_text_bounded" CHECK (char_length("schedule_notes"."text") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "schedule_notes" ADD CONSTRAINT "schedule_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_notes" ADD CONSTRAINT "schedule_notes_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_notes" ADD CONSTRAINT "schedule_notes_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_notes" ADD CONSTRAINT "schedule_notes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_notes_scope_idx" ON "schedule_notes" USING btree ("site_id","org_unit_id","period_month");