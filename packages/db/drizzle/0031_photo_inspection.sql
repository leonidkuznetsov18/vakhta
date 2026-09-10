CREATE TABLE "photo_inspection_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"review" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_inspection_revisions_version_valid" CHECK ("photo_inspection_revisions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "photo_inspection_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inspection_id" uuid NOT NULL,
	"review_version" integer NOT NULL,
	"context" jsonb NOT NULL,
	"guidance" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"prediction" jsonb,
	"usage" jsonb,
	"error_code" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "photo_inspection_runs_state_valid" CHECK (("photo_inspection_runs"."status" = 'PENDING' AND "photo_inspection_runs"."completed_at" IS NULL AND "photo_inspection_runs"."prediction" IS NULL AND "photo_inspection_runs"."error_code" IS NULL) OR ("photo_inspection_runs"."status" = 'SUCCEEDED' AND "photo_inspection_runs"."completed_at" IS NOT NULL AND "photo_inspection_runs"."prediction" IS NOT NULL AND "photo_inspection_runs"."error_code" IS NULL) OR ("photo_inspection_runs"."status" = 'FAILED' AND "photo_inspection_runs"."completed_at" IS NOT NULL AND "photo_inspection_runs"."prediction" IS NULL AND "photo_inspection_runs"."error_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "photo_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"context" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"review" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "photo_inspections_version_valid" CHECK ("photo_inspections"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "background_tasks" DROP CONSTRAINT "background_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "photo_inspection_revisions" ADD CONSTRAINT "photo_inspection_revisions_inspection_id_photo_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."photo_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_inspection_runs" ADD CONSTRAINT "photo_inspection_runs_inspection_id_photo_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."photo_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_inspections" ADD CONSTRAINT "photo_inspections_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_inspections" ADD CONSTRAINT "photo_inspections_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_inspection_revisions_version_uq" ON "photo_inspection_revisions" USING btree ("inspection_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_inspection_runs_pending_uq" ON "photo_inspection_runs" USING btree ("inspection_id") WHERE "photo_inspection_runs"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "photo_inspection_runs_requested_idx" ON "photo_inspection_runs" USING btree ("requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_inspections_identity_uq" ON "photo_inspections" USING btree ("handover_id","media_id","item_key");--> statement-breakpoint
ALTER TABLE "background_tasks" ADD CONSTRAINT "background_tasks_kind_valid" CHECK ("background_tasks"."kind" IN ('PHOTO_INSPECT', 'MEDIA_PROCESS', 'SHIFT_REMINDER', 'ACK_REMINDER', 'RETURN_REMINDER', 'DOWNTIME_ESCALATION', 'INCIDENT_SLA', 'HANDOVER_TIMEOUT', 'CLEANING_REMINDER', 'BONUS_RECALCULATE'));
--> statement-breakpoint
CREATE FUNCTION guard_photo_inspection_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Photo inspection revisions are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER photo_inspection_revision_immutable BEFORE UPDATE OR DELETE ON photo_inspection_revisions
FOR EACH ROW EXECUTE FUNCTION guard_photo_inspection_revision();
--> statement-breakpoint
CREATE FUNCTION guard_photo_inspection_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Photo inspection runs cannot be deleted'; END IF;
  IF OLD.status <> 'PENDING' OR
     ROW(NEW.id, NEW.inspection_id, NEW.review_version, NEW.context, NEW.guidance, NEW.model, NEW.prompt_version, NEW.requested_by, NEW.requested_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.inspection_id, OLD.review_version, OLD.context, OLD.guidance, OLD.model, OLD.prompt_version, OLD.requested_by, OLD.requested_at)
  THEN RAISE EXCEPTION 'Photo inspection run intent and completed results are immutable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER photo_inspection_run_immutable BEFORE UPDATE OR DELETE ON photo_inspection_runs
FOR EACH ROW EXECUTE FUNCTION guard_photo_inspection_run();
