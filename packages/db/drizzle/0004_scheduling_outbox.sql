CREATE TYPE "public"."assignment_status" AS ENUM('PLANNED', 'CANCELLED', 'REPLACED');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."shift_kind" AS ENUM('REGULAR', 'EXTRA', 'REPLACEMENT', 'SWAP');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('TELEGRAM');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('EMPLOYEE', 'WEB_USER');--> statement-breakpoint
CREATE TABLE "assignment_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"schedule_version_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "assignment_acknowledgements_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period_month" text NOT NULL,
	"version_no" integer NOT NULL,
	"status" "schedule_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"published_at" timestamp with time zone,
	"supersedes_id" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_version_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"plan_start_at" timestamp with time zone NOT NULL,
	"plan_end_at" timestamp with time zone NOT NULL,
	"position_id" uuid,
	"org_unit_id" uuid NOT NULL,
	"team_id" uuid,
	"zone_id" uuid,
	"kind" "shift_kind" DEFAULT 'REGULAR' NOT NULL,
	"status" "assignment_status" DEFAULT 'PLANNED' NOT NULL,
	"replaces_assignment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"local_start" text NOT NULL,
	"local_end" text NOT NULL,
	"is_night" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" "notification_channel" DEFAULT 'TELEGRAM' NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"telegram_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "assignment_acknowledgements" ADD CONSTRAINT "assignment_acknowledgements_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_acknowledgements" ADD CONSTRAINT "assignment_acknowledgements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_acknowledgements" ADD CONSTRAINT "assignment_acknowledgements_schedule_version_id_schedule_versions_id_fk" FOREIGN KEY ("schedule_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_supersedes_id_schedule_versions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_schedule_version_id_schedule_versions_id_fk" FOREIGN KEY ("schedule_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_acks_version_employee_idx" ON "assignment_acknowledgements" USING btree ("schedule_version_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_versions_key_no_uq" ON "schedule_versions" USING btree ("site_id","org_unit_id","period_month","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_versions_published_uq" ON "schedule_versions" USING btree ("site_id","org_unit_id","period_month") WHERE "schedule_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "schedule_versions_unit_month_idx" ON "schedule_versions" USING btree ("org_unit_id","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_assignments_version_employee_date_uq" ON "shift_assignments" USING btree ("schedule_version_id","employee_id","business_date");--> statement-breakpoint
CREATE INDEX "shift_assignments_employee_start_idx" ON "shift_assignments" USING btree ("employee_id","plan_start_at");--> statement-breakpoint
CREATE INDEX "shift_assignments_version_idx" ON "shift_assignments" USING btree ("schedule_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_templates_site_code_uq" ON "shift_templates" USING btree ("site_id","code");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");