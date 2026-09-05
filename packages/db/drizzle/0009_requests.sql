CREATE TYPE "public"."decision_value" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."overtime_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('VACATION', 'SICK', 'DAY_OFF', 'SWAP', 'EXTRA_SHIFT', 'CANNOT_ATTEND', 'LATE', 'EARLY_LEAVE', 'TECH_ISSUE', 'CORRECTION', 'APPEAL');--> statement-breakpoint
CREATE TABLE "overtime_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_session_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"status" "overtime_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"decided_by" text,
	"comment" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"step_key" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"acting_role" text,
	"decision" "decision_value" NOT NULL,
	"comment" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "request_type" NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'SUBMITTED' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"period_from" date,
	"period_to" date,
	"assignment_id" uuid,
	"counterpart_employee_id" uuid,
	"shift_session_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment" text,
	"medical_media_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"step_deadline_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"result_version_id" uuid,
	"compensating_event_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_decisions" ADD CONSTRAINT "request_decisions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_counterpart_employee_id_employees_id_fk" FOREIGN KEY ("counterpart_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_result_version_id_schedule_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overtime_approvals_session_idx" ON "overtime_approvals" USING btree ("shift_session_id");--> statement-breakpoint
CREATE INDEX "request_decisions_request_idx" ON "request_decisions" USING btree ("request_id","at");--> statement-breakpoint
CREATE INDEX "requests_employee_idx" ON "requests" USING btree ("employee_id","submitted_at");--> statement-breakpoint
CREATE INDEX "requests_status_type_idx" ON "requests" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "requests_counterpart_idx" ON "requests" USING btree ("counterpart_employee_id");