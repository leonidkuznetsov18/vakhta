CREATE TYPE "public"."handover_angle" AS ENUM('OVERVIEW', 'SURFACES', 'FLOOR');--> statement-breakpoint
CREATE TYPE "public"."handover_resolution" AS ENUM('RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT');--> statement-breakpoint
CREATE TYPE "public"."handover_status" AS ENUM('DRAFT', 'SUBMITTED', 'ACCEPTED', 'DISPUTED', 'RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."media_quality" AS ENUM('PENDING', 'OK', 'LOW_RES', 'DARK', 'CORRUPT', 'DUPLICATE_SUSPECT', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('ACCEPTED', 'ISSUE');--> statement-breakpoint
CREATE TABLE "checklist_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"ok" boolean NOT NULL,
	"remark_category" text,
	"remark_text" text,
	"safe_to_work" boolean,
	"needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"zone_type" "zone_type",
	"position_id" uuid,
	"items" jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"angle" "handover_angle" NOT NULL,
	"media_object_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_session_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"checklist_definition_id" uuid NOT NULL,
	"status" "handover_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cannot_complete_reason" text,
	"cannot_complete_comment" text,
	"submitted_at" timestamp with time zone,
	"accept_deadline_at" timestamp with time zone,
	"escalated_to_master_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"resolved_by" text,
	"decision" "handover_resolution" NOT NULL,
	"reason_code" text,
	"comment" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"reviewer_employee_id" uuid NOT NULL,
	"reviewer_shift_session_id" uuid,
	"decision" "review_decision" NOT NULL,
	"category" text,
	"comment" text,
	"media_object_id" uuid,
	"incident_id" uuid,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_file_id" text NOT NULL,
	"telegram_file_unique_id" text NOT NULL,
	"uploaded_by" uuid,
	"purpose" text NOT NULL,
	"storage_key" text,
	"content_type" text,
	"size_bytes" bigint,
	"width" integer,
	"height" integer,
	"sha256" text,
	"phash" text,
	"brightness" smallint,
	"quality" "media_quality" DEFAULT 'PENDING' NOT NULL,
	"quality_notes" text,
	"duplicate_of_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"retention_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_definitions" ADD CONSTRAINT "checklist_definitions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_media" ADD CONSTRAINT "handover_media_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_media" ADD CONSTRAINT "handover_media_media_object_id_media_objects_id_fk" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_submitted_by_employees_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_checklist_definition_id_checklist_definitions_id_fk" FOREIGN KEY ("checklist_definition_id") REFERENCES "public"."checklist_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_resolutions" ADD CONSTRAINT "handover_resolutions_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reviews" ADD CONSTRAINT "handover_reviews_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reviews" ADD CONSTRAINT "handover_reviews_reviewer_employee_id_employees_id_fk" FOREIGN KEY ("reviewer_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reviews" ADD CONSTRAINT "handover_reviews_reviewer_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("reviewer_shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reviews" ADD CONSTRAINT "handover_reviews_media_object_id_media_objects_id_fk" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_uploaded_by_employees_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_answers_item_uq" ON "checklist_answers" USING btree ("handover_id","item_key");--> statement-breakpoint
CREATE INDEX "checklist_definitions_active_idx" ON "checklist_definitions" USING btree ("is_active","zone_type","position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handover_media_angle_uq" ON "handover_media" USING btree ("handover_id","angle");--> statement-breakpoint
CREATE UNIQUE INDEX "handover_records_open_uq" ON "handover_records" USING btree ("shift_session_id") WHERE "handover_records"."status" IN ('DRAFT', 'SUBMITTED', 'DISPUTED');--> statement-breakpoint
CREATE INDEX "handover_records_zone_status_idx" ON "handover_records" USING btree ("zone_id","status");--> statement-breakpoint
CREATE INDEX "handover_records_status_deadline_idx" ON "handover_records" USING btree ("status","accept_deadline_at");--> statement-breakpoint
CREATE INDEX "handover_resolutions_handover_idx" ON "handover_resolutions" USING btree ("handover_id");--> statement-breakpoint
CREATE INDEX "handover_reviews_handover_idx" ON "handover_reviews" USING btree ("handover_id");--> statement-breakpoint
CREATE INDEX "media_objects_sha_idx" ON "media_objects" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "media_objects_received_idx" ON "media_objects" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "media_objects_unique_file_idx" ON "media_objects" USING btree ("telegram_file_unique_id");