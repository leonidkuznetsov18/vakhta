CREATE TABLE "photo_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "photo_objects_name_valid" CHECK (length(trim("photo_objects"."name")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "photo_objects_name_uq" ON "photo_objects" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" ADD COLUMN "rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Existing free-text rule names become catalog entries (one per spelling, case-insensitive).
INSERT INTO "photo_objects" ("name", "updated_by")
SELECT DISTINCT ON (lower(trim(item))) trim(item), 'migration:0035'
FROM "checklist_photo_rules" r, jsonb_array_elements_text(r."items") AS item
WHERE trim(item) <> ''
ORDER BY lower(trim(item)), trim(item)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Rules now reference catalog ids; clarification and exceptions fold into one note.
UPDATE "checklist_photo_rules" r SET "rules" = COALESCE((
	SELECT jsonb_agg(jsonb_build_object('objectId', o."id", 'note', trim(concat_ws(' ',
		NULLIF(trim(d."value"->>'clarification'), ''),
		CASE WHEN NULLIF(trim(d."value"->>'exceptions'), '') IS NULL THEN NULL
			ELSE 'Дозволено: ' || trim(d."value"->>'exceptions') END))) ORDER BY t.ord)
	FROM jsonb_array_elements_text(r."items") WITH ORDINALITY AS t(item, ord)
	JOIN "photo_objects" o ON lower(o."name") = lower(trim(t.item))
	LEFT JOIN LATERAL (
		SELECT value FROM jsonb_array_elements(r."details") AS value WHERE value->>'item' = t.item LIMIT 1
	) d ON true
), '[]'::jsonb);--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP CONSTRAINT "checklist_photo_rules_details_valid";--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP CONSTRAINT "checklist_photo_rules_items_valid";--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP COLUMN "items";--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP COLUMN "details";--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" ADD CONSTRAINT "checklist_photo_rules_rules_valid" CHECK (jsonb_typeof("checklist_photo_rules"."rules") = 'array' and jsonb_array_length("checklist_photo_rules"."rules") <= 30);--> statement-breakpoint
ALTER TABLE "photo_inspection_revisions" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "photo_inspection_revisions" ADD CONSTRAINT "photo_inspection_revisions_duration_valid" CHECK ("photo_inspection_revisions"."duration_ms" IS NULL OR "photo_inspection_revisions"."duration_ms" >= 0);--> statement-breakpoint
DROP INDEX "photo_inspection_runs_automatic_uq";--> statement-breakpoint
ALTER TABLE "photo_inspections" DROP COLUMN "reviewed_automatic_run_id";--> statement-breakpoint
-- The automatic review stage is gone: the status enum is rebuilt without MASTER_REVIEW.
-- Indexes whose predicates name status literals are dropped first so the old type can go.
DROP INDEX "handover_records_open_uq";--> statement-breakpoint
DROP INDEX "handover_records_zone_status_idx";--> statement-breakpoint
DROP INDEX "handover_records_status_deadline_idx";--> statement-breakpoint
ALTER TABLE "handover_records" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "handover_records" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "handover_records" SET "status" = 'SUBMITTED', "updated_at" = now() WHERE "status" = 'MASTER_REVIEW';--> statement-breakpoint
DROP TYPE "public"."handover_status";--> statement-breakpoint
CREATE TYPE "public"."handover_status" AS ENUM('DRAFT', 'SUBMITTED', 'ACCEPTED', 'DISPUTED', 'RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT', 'SUPERSEDED');--> statement-breakpoint
ALTER TABLE "handover_records" ALTER COLUMN "status" SET DATA TYPE "public"."handover_status" USING "status"::"public"."handover_status";--> statement-breakpoint
ALTER TABLE "handover_records" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"public"."handover_status";--> statement-breakpoint
CREATE UNIQUE INDEX "handover_records_open_uq" ON "handover_records" USING btree ("shift_session_id") WHERE "handover_records"."status" NOT IN ('ACCEPTED', 'RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT', 'SUPERSEDED');--> statement-breakpoint
CREATE INDEX "handover_records_zone_status_idx" ON "handover_records" USING btree ("zone_id","status");--> statement-breakpoint
CREATE INDEX "handover_records_status_deadline_idx" ON "handover_records" USING btree ("status","accept_deadline_at");
