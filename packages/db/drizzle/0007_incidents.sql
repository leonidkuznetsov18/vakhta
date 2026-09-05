CREATE TYPE "public"."incident_severity" AS ENUM('NORMAL', 'CRITICAL', 'SAFETY');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'REJECTED');--> statement-breakpoint
CREATE TABLE "downtime_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"org_unit_id" uuid,
	"zone_id" uuid,
	"reason_code" text NOT NULL,
	"severity" "incident_severity" DEFAULT 'NORMAL' NOT NULL,
	"status" "incident_status" DEFAULT 'REPORTED' NOT NULL,
	"duplicate_of_id" uuid,
	"assignee_id" text,
	"opened_at" timestamp with time zone NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"reports_count" integer DEFAULT 0 NOT NULL,
	"last_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downtime_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"shift_session_id" uuid,
	"employee_id" uuid NOT NULL,
	"zone_id" uuid,
	"reason_code" text NOT NULL,
	"comment" text,
	"stopped_work" boolean DEFAULT false NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"telegram_file_id" text,
	"media_object_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_status" "incident_status",
	"to_status" "incident_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment" text
);
--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD CONSTRAINT "downtime_incidents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD CONSTRAINT "downtime_incidents_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD CONSTRAINT "downtime_incidents_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD CONSTRAINT "downtime_reports_incident_id_downtime_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."downtime_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD CONSTRAINT "downtime_reports_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD CONSTRAINT "downtime_reports_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reports" ADD CONSTRAINT "downtime_reports_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incident_id_downtime_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."downtime_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "downtime_incidents_status_opened_idx" ON "downtime_incidents" USING btree ("status","opened_at");--> statement-breakpoint
CREATE INDEX "downtime_incidents_zone_status_idx" ON "downtime_incidents" USING btree ("zone_id","status");--> statement-breakpoint
CREATE INDEX "downtime_incidents_site_opened_idx" ON "downtime_incidents" USING btree ("site_id","opened_at");--> statement-breakpoint
CREATE INDEX "downtime_reports_incident_idx" ON "downtime_reports" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "downtime_reports_session_idx" ON "downtime_reports" USING btree ("shift_session_id");--> statement-breakpoint
CREATE INDEX "downtime_reports_employee_time_idx" ON "downtime_reports" USING btree ("employee_id","reported_at");--> statement-breakpoint
CREATE INDEX "incident_status_history_incident_idx" ON "incident_status_history" USING btree ("incident_id","at");