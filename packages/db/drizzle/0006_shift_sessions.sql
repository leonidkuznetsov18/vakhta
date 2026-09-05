CREATE TYPE "public"."resumable_state" AS ENUM('PREPARATION', 'WORKING', 'CLEANING', 'HANDOVER');--> statement-breakpoint
CREATE TYPE "public"."shift_start_method" AS ENUM('EMPLOYEE', 'MASTER');--> statement-breakpoint
CREATE TYPE "public"."shift_state" AS ENUM('NOT_STARTED', 'PREPARATION', 'WORKING', 'CLEANING', 'HANDOVER', 'BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME', 'READY_TO_CLOSE', 'SHIFT_CLOSED', 'EMERGENCY_EXIT');--> statement-breakpoint
CREATE TABLE "activity_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_session_id" uuid NOT NULL,
	"state" "shift_state" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"resume_state" "resumable_state",
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_intervals_positive" CHECK ("activity_intervals"."ended_at" IS NULL OR "activity_intervals"."ended_at" >= "activity_intervals"."started_at")
);
--> statement-breakpoint
CREATE TABLE "shift_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"assignment_id" uuid,
	"presence_id" uuid,
	"business_date" date NOT NULL,
	"state" "shift_state" DEFAULT 'NOT_STARTED' NOT NULL,
	"resume_state" "resumable_state",
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"start_method" "shift_start_method" DEFAULT 'EMPLOYEE' NOT NULL,
	"zone_id" uuid,
	"zone_accepted_at" timestamp with time zone,
	"needs_clarification" boolean DEFAULT false NOT NULL,
	"clarification_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_sessions_resume_consistent" CHECK (("shift_sessions"."state" IN ('BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME')) = ("shift_sessions"."resume_state" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shift_summaries" (
	"shift_session_id" uuid PRIMARY KEY NOT NULL,
	"employee_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"planned_minutes" integer,
	"total_minutes" integer NOT NULL,
	"work_minutes" integer NOT NULL,
	"preparation_minutes" integer NOT NULL,
	"service_minutes" integer NOT NULL,
	"break_minutes" integer NOT NULL,
	"meal_minutes" integer NOT NULL,
	"downtime_minutes" integer NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_leave_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_pending" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_presence_id_presence_sessions_id_fk" FOREIGN KEY ("presence_id") REFERENCES "public"."presence_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_intervals_open_uq" ON "activity_intervals" USING btree ("shift_session_id") WHERE "activity_intervals"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "activity_intervals_session_start_idx" ON "activity_intervals" USING btree ("shift_session_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_sessions_active_uq" ON "shift_sessions" USING btree ("employee_id") WHERE "shift_sessions"."state" NOT IN ('SHIFT_CLOSED', 'EMERGENCY_EXIT');--> statement-breakpoint
CREATE INDEX "shift_sessions_employee_date_idx" ON "shift_sessions" USING btree ("employee_id","business_date");--> statement-breakpoint
CREATE INDEX "shift_sessions_state_idx" ON "shift_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "shift_sessions_assignment_idx" ON "shift_sessions" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "shift_summaries_employee_date_idx" ON "shift_summaries" USING btree ("employee_id","business_date");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- ТЗ 4.5: інтервали однієї зміни не перетинаються; відкритий інтервал триває до +∞.
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_no_overlap"
  EXCLUDE USING gist ("shift_session_id" WITH =, tstzrange("started_at", "ended_at", '[)') WITH &&);
