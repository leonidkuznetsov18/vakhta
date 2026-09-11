ALTER TYPE "public"."handover_status" ADD VALUE 'MASTER_REVIEW' BEFORE 'ACCEPTED';--> statement-breakpoint
CREATE TABLE "checklist_photo_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "checklist_photo_rules_version_valid" CHECK ("checklist_photo_rules"."version" > 0),
	CONSTRAINT "checklist_photo_rules_items_valid" CHECK (jsonb_typeof("checklist_photo_rules"."items") = 'array' and jsonb_array_length("checklist_photo_rules"."items") <= 30)
);
--> statement-breakpoint
DROP INDEX "handover_records_open_uq";--> statement-breakpoint
ALTER TABLE "photo_inspections" ADD COLUMN "reviewed_automatic_run_id" uuid;--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" ADD CONSTRAINT "checklist_photo_rules_definition_id_checklist_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."checklist_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" ADD CONSTRAINT "checklist_photo_rules_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_photo_rules_family_zone_uq" ON "checklist_photo_rules" USING btree ("family_id","zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handover_records_open_uq" ON "handover_records" USING btree ("shift_session_id") WHERE "handover_records"."status" NOT IN ('ACCEPTED', 'RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT', 'SUPERSEDED');