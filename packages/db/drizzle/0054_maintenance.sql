CREATE TYPE "public"."equipment_criticality" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."equipment_document_kind" AS ENUM('OPERATING_MANUAL', 'SERVICE_MANUAL', 'PARTS_LIST', 'WIRING_DIAGRAM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."equipment_release_mode" AS ENUM('AVAILABLE', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."equipment_state" AS ENUM('AVAILABLE', 'RESTRICTED', 'STOPPED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."maintenance_anchor_mode" AS ENUM('FROM_COMPLETION', 'FIXED_CALENDAR');--> statement-breakpoint
CREATE TYPE "public"."maintenance_interval_unit" AS ENUM('DAY', 'WEEK', 'MONTH');--> statement-breakpoint
CREATE TYPE "public"."maintenance_material_kind" AS ENUM('PART', 'MATERIAL', 'TOOL');--> statement-breakpoint
CREATE TYPE "public"."maintenance_material_mode" AS ENUM('EVERY_CYCLE', 'IF_NEEDED');--> statement-breakpoint
CREATE TYPE "public"."maintenance_plan_source" AS ENUM('DOCUMENT', 'PLANT_DECISION');--> statement-breakpoint
CREATE TYPE "public"."maintenance_plan_state" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."materials_readiness" AS ENUM('UNKNOWN', 'READY', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."stop_start_quality" AS ENUM('FROM_REPORT', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."work_operation_result" AS ENUM('DONE', 'NOT_DONE', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."work_order_priority" AS ENUM('P0', 'P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('ASSIGNED', 'IN_PROGRESS', 'WAITING', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."work_order_type" AS ENUM('PLANNED_MAINTENANCE', 'EMERGENCY_REPAIR');--> statement-breakpoint
CREATE TYPE "public"."work_review_decision" AS ENUM('ACCEPTED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."work_wait_reason" AS ENUM('NO_PART', 'NEED_SPECIALIST', 'WAITING_WINDOW', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."web_role" ADD VALUE 'CHIEF_MECHANIC';--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text NOT NULL,
	"site_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"zone_id" uuid,
	"equipment_type" text,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"manufactured_year" smallint,
	"commissioned_on" date,
	"criticality" "equipment_criticality" NOT NULL,
	"responsible_employee_id" uuid NOT NULL,
	"backup_employee_id" uuid,
	"state" "equipment_state" DEFAULT 'AVAILABLE' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restriction" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_code_key_uq" UNIQUE("code_key"),
	CONSTRAINT "equipment_code_key_valid" CHECK ("equipment"."code_key" = lower(btrim("equipment"."code")) AND "equipment"."code_key" <> ''),
	CONSTRAINT "equipment_backup_distinct" CHECK ("equipment"."backup_employee_id" IS DISTINCT FROM "equipment"."responsible_employee_id"),
	CONSTRAINT "equipment_year_valid" CHECK ("equipment"."manufactured_year" IS NULL OR "equipment"."manufactured_year" BETWEEN 1900 AND 2100),
	CONSTRAINT "equipment_restriction_valid" CHECK ("equipment"."state" <> 'RESTRICTED' OR "equipment"."restriction" IS NOT NULL),
	CONSTRAINT "equipment_version_valid" CHECK ("equipment"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "equipment_document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"linked_by" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_by" text,
	"unlinked_at" timestamp with time zone,
	CONSTRAINT "equipment_document_links_unlink_valid" CHECK (("equipment_document_links"."unlinked_at" IS NULL) = ("equipment_document_links"."unlinked_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "equipment_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" "equipment_document_kind" NOT NULL,
	"language" text,
	"edition" text,
	"source_url" text,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"telegram_file_id" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_documents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "equipment_documents_pdf" CHECK ("equipment_documents"."content_type" = 'application/pdf'),
	CONSTRAINT "equipment_documents_size" CHECK ("equipment_documents"."size_bytes" > 0 AND "equipment_documents"."size_bytes" <= 52428800),
	CONSTRAINT "equipment_documents_url" CHECK ("equipment_documents"."source_url" IS NULL OR "equipment_documents"."source_url" ~ '^https?://'),
	CONSTRAINT "equipment_documents_title" CHECK (btrim("equipment_documents"."title") <> '')
);
--> statement-breakpoint
CREATE TABLE "equipment_stop_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"incident_id" uuid,
	"work_order_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"start_quality" "stop_start_quality" NOT NULL,
	"released_at" timestamp with time zone,
	"release_mode" "equipment_release_mode",
	"release_condition" text,
	"released_by" text,
	CONSTRAINT "equipment_stop_episodes_release" CHECK (("equipment_stop_episodes"."released_at" IS NULL AND "equipment_stop_episodes"."release_mode" IS NULL AND "equipment_stop_episodes"."released_by" IS NULL) OR ("equipment_stop_episodes"."released_at" >= "equipment_stop_episodes"."started_at" AND "equipment_stop_episodes"."release_mode" IS NOT NULL AND "equipment_stop_episodes"."released_by" IS NOT NULL)),
	CONSTRAINT "equipment_stop_episodes_condition" CHECK ("equipment_stop_episodes"."release_mode" IS DISTINCT FROM 'RESTRICTED' OR "equipment_stop_episodes"."release_condition" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "maintenance_material_kind" NOT NULL,
	"name" text NOT NULL,
	"article" text,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"mode" "maintenance_material_mode" NOT NULL,
	CONSTRAINT "maintenance_plan_materials_ordinal_uq" UNIQUE("version_id","ordinal"),
	CONSTRAINT "maintenance_plan_materials_quantity" CHECK ("maintenance_plan_materials"."quantity" > 0),
	CONSTRAINT "maintenance_plan_materials_name" CHECK (btrim("maintenance_plan_materials"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"place" text,
	"photo_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "maintenance_plan_operations_ordinal_uq" UNIQUE("version_id","ordinal"),
	CONSTRAINT "maintenance_plan_operations_text" CHECK (btrim("maintenance_plan_operations"."text") <> '')
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"interval_unit" "maintenance_interval_unit" NOT NULL,
	"interval_count" integer NOT NULL,
	"anchor_mode" "maintenance_anchor_mode" NOT NULL,
	"source_kind" "maintenance_plan_source" NOT NULL,
	"source_document_id" uuid,
	"source_reference" text,
	"source_note" text,
	"estimated_minutes" integer NOT NULL,
	"requires_stop" boolean NOT NULL,
	"assignee_employee_id" uuid,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_plan_versions_revision_uq" UNIQUE("plan_id","revision"),
	CONSTRAINT "maintenance_plan_versions_interval" CHECK ("maintenance_plan_versions"."interval_count" > 0),
	CONSTRAINT "maintenance_plan_versions_minutes" CHECK ("maintenance_plan_versions"."estimated_minutes" > 0),
	CONSTRAINT "maintenance_plan_versions_source" CHECK ("maintenance_plan_versions"."published_at" IS NULL OR ("maintenance_plan_versions"."source_kind" = 'DOCUMENT' AND "maintenance_plan_versions"."source_document_id" IS NOT NULL) OR ("maintenance_plan_versions"."source_kind" = 'PLANT_DECISION' AND "maintenance_plan_versions"."source_note" IS NOT NULL AND btrim("maintenance_plan_versions"."source_note") <> '')),
	CONSTRAINT "maintenance_plan_versions_assignee" CHECK ("maintenance_plan_versions"."published_at" IS NULL OR "maintenance_plan_versions"."assignee_employee_id" IS NOT NULL),
	CONSTRAINT "maintenance_plan_versions_published" CHECK (("maintenance_plan_versions"."published_at" IS NULL) = ("maintenance_plan_versions"."published_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" "maintenance_plan_state" DEFAULT 'DRAFT' NOT NULL,
	"active_version_id" uuid,
	"first_due_on" date,
	"state_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_plans_active_version" CHECK ("maintenance_plans"."state" = 'DRAFT' OR "maintenance_plans"."active_version_id" IS NOT NULL),
	CONSTRAINT "maintenance_plans_reason" CHECK ("maintenance_plans"."state" NOT IN ('PAUSED', 'ARCHIVED') OR "maintenance_plans"."state_reason" IS NOT NULL),
	CONSTRAINT "maintenance_plans_title" CHECK (btrim("maintenance_plans"."title") <> '')
);
--> statement-breakpoint
CREATE TABLE "work_order_operation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"result" "work_operation_result" NOT NULL,
	"reason" text,
	"media_object_id" uuid,
	"answered_by" uuid NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "work_order_operation_results_uq" UNIQUE("work_order_id","operation_id"),
	CONSTRAINT "work_order_operation_results_reason" CHECK ("work_order_operation_results"."result" = 'DONE' OR ("work_order_operation_results"."reason" IS NOT NULL AND btrim("work_order_operation_results"."reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "work_order_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"iteration" integer NOT NULL,
	"decision" "work_review_decision" NOT NULL,
	"comment" text,
	"reviewer" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "work_order_reviews_iteration_uq" UNIQUE("work_order_id","iteration"),
	CONSTRAINT "work_order_reviews_return_comment" CHECK ("work_order_reviews"."decision" = 'ACCEPTED' OR ("work_order_reviews"."comment" IS NOT NULL AND btrim("work_order_reviews"."comment") <> ''))
);
--> statement-breakpoint
CREATE TABLE "work_order_waits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"reason" "work_wait_reason" NOT NULL,
	"note" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "work_order_waits_order" CHECK ("work_order_waits"."ended_at" IS NULL OR "work_order_waits"."ended_at" >= "work_order_waits"."started_at")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "work_orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"type" "work_order_type" NOT NULL,
	"priority" "work_order_priority" NOT NULL,
	"equipment_id" uuid NOT NULL,
	"plan_id" uuid,
	"plan_version_id" uuid,
	"cycle_key" text,
	"incident_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "work_order_status" DEFAULT 'ASSIGNED' NOT NULL,
	"due_on" date,
	"planned_on" date,
	"assignee_employee_id" uuid NOT NULL,
	"lead_employee_id" uuid,
	"reported_at" timestamp with time zone,
	"reported_by" text,
	"ack_due_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"performed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"performed_by_employee_id" uuid,
	"entered_by" text,
	"readiness" "materials_readiness" DEFAULT 'UNKNOWN' NOT NULL,
	"readiness_note" text,
	"summary" text,
	"cause" text,
	"parts_used" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_number_uq" UNIQUE("number"),
	CONSTRAINT "work_orders_planned_shape" CHECK ("work_orders"."type" <> 'PLANNED_MAINTENANCE' OR ("work_orders"."plan_id" IS NOT NULL AND "work_orders"."plan_version_id" IS NOT NULL AND "work_orders"."cycle_key" IS NOT NULL AND "work_orders"."due_on" IS NOT NULL AND "work_orders"."planned_on" IS NOT NULL)),
	CONSTRAINT "work_orders_emergency_shape" CHECK ("work_orders"."type" <> 'EMERGENCY_REPAIR' OR ("work_orders"."reported_at" IS NOT NULL AND "work_orders"."ack_due_at" IS NOT NULL)),
	CONSTRAINT "work_orders_cancel_reason" CHECK ("work_orders"."status" <> 'CANCELLED' OR ("work_orders"."cancel_reason" IS NOT NULL AND "work_orders"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "work_orders_completed" CHECK ("work_orders"."status" <> 'COMPLETED' OR "work_orders"."completed_at" IS NOT NULL),
	CONSTRAINT "work_orders_version_valid" CHECK ("work_orders"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "background_tasks" DROP CONSTRAINT "background_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "performs_maintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD COLUMN "equipment_id" uuid;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD COLUMN "equipment_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_backup_employee_id_employees_id_fk" FOREIGN KEY ("backup_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_unit_site_fk" FOREIGN KEY ("org_unit_id","site_id") REFERENCES "public"."org_units"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_document_links" ADD CONSTRAINT "equipment_document_links_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_document_links" ADD CONSTRAINT "equipment_document_links_document_id_equipment_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."equipment_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_stop_episodes" ADD CONSTRAINT "equipment_stop_episodes_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_stop_episodes" ADD CONSTRAINT "equipment_stop_episodes_incident_id_downtime_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."downtime_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_stop_episodes" ADD CONSTRAINT "equipment_stop_episodes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_materials" ADD CONSTRAINT "maintenance_plan_materials_version_id_maintenance_plan_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."maintenance_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_operations" ADD CONSTRAINT "maintenance_plan_operations_version_id_maintenance_plan_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."maintenance_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_versions" ADD CONSTRAINT "maintenance_plan_versions_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_versions" ADD CONSTRAINT "maintenance_plan_versions_source_document_id_equipment_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."equipment_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_versions" ADD CONSTRAINT "maintenance_plan_versions_assignee_employee_id_employees_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_operation_results" ADD CONSTRAINT "work_order_operation_results_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_operation_results" ADD CONSTRAINT "work_order_operation_results_operation_id_maintenance_plan_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."maintenance_plan_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_operation_results" ADD CONSTRAINT "work_order_operation_results_media_object_id_media_objects_id_fk" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_operation_results" ADD CONSTRAINT "work_order_operation_results_answered_by_employees_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_reviews" ADD CONSTRAINT "work_order_reviews_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_waits" ADD CONSTRAINT "work_order_waits_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_plan_version_id_maintenance_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."maintenance_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_incident_id_downtime_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."downtime_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignee_employee_id_employees_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_lead_employee_id_employees_id_fk" FOREIGN KEY ("lead_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_performed_by_employee_id_employees_id_fk" FOREIGN KEY ("performed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_unit_idx" ON "equipment" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "equipment_zone_idx" ON "equipment" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "equipment_responsible_idx" ON "equipment" USING btree ("responsible_employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_document_links_active_uq" ON "equipment_document_links" USING btree ("equipment_id","document_id") WHERE "equipment_document_links"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "equipment_document_links_document_idx" ON "equipment_document_links" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_stop_episodes_open_uq" ON "equipment_stop_episodes" USING btree ("equipment_id") WHERE "equipment_stop_episodes"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "maintenance_plans_equipment_idx" ON "maintenance_plans" USING btree ("equipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_waits_open_uq" ON "work_order_waits" USING btree ("work_order_id") WHERE "work_order_waits"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_plan_cycle_uq" ON "work_orders" USING btree ("plan_id","cycle_key") WHERE "work_orders"."plan_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_open_emergency_uq" ON "work_orders" USING btree ("equipment_id") WHERE "work_orders"."type" = 'EMERGENCY_REPAIR' AND "work_orders"."status" NOT IN ('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE INDEX "work_orders_equipment_idx" ON "work_orders" USING btree ("equipment_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_assignee_idx" ON "work_orders" USING btree ("assignee_employee_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_planned_idx" ON "work_orders" USING btree ("planned_on");--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD CONSTRAINT "downtime_incidents_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD CONSTRAINT "downtime_reports_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_tasks" ADD CONSTRAINT "background_tasks_kind_valid" CHECK ("background_tasks"."kind" IN ('PHOTO_INSPECT', 'MEDIA_PROCESS', 'SHIFT_REMINDER', 'ACK_REMINDER', 'RETURN_REMINDER', 'DOWNTIME_ESCALATION', 'INCIDENT_SLA', 'HANDOVER_TIMEOUT', 'CLEANING_REMINDER', 'BONUS_RECALCULATE', 'BIRTHDAY_GREETING', 'ABSENCE_CHECKIN', 'ABSENCE_RETURN', 'MAINTENANCE_REMINDER', 'EMERGENCY_ACK', 'EMERGENCY_ESCALATION'));--> statement-breakpoint
-- Mechanics look after machines (spec 014, A-1); other positions opt in from Directories.
UPDATE "positions" SET "performs_maintenance" = true WHERE "code" = 'MECHANIC';--> statement-breakpoint
-- A published plan version is history: completed work keeps its operations and materials (TZ-M R10).
CREATE FUNCTION "maintenance_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'maintenance_plan_versions' THEN
    IF OLD."published_at" IS NOT NULL THEN
      RAISE EXCEPTION 'published maintenance plan version % is immutable', OLD."id";
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF EXISTS (
    SELECT 1 FROM "maintenance_plan_versions" v
    WHERE v."id" = COALESCE(OLD."version_id", NEW."version_id") AND v."published_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'published maintenance plan version % is immutable', COALESCE(OLD."version_id", NEW."version_id");
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint
CREATE TRIGGER "maintenance_plan_versions_immutable" BEFORE UPDATE OR DELETE ON "maintenance_plan_versions"
  FOR EACH ROW EXECUTE FUNCTION "maintenance_version_immutable"();--> statement-breakpoint
CREATE TRIGGER "maintenance_plan_operations_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "maintenance_plan_operations"
  FOR EACH ROW EXECUTE FUNCTION "maintenance_version_immutable"();--> statement-breakpoint
CREATE TRIGGER "maintenance_plan_materials_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "maintenance_plan_materials"
  FOR EACH ROW EXECUTE FUNCTION "maintenance_version_immutable"();
