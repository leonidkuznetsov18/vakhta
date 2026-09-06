CREATE TYPE "public"."adjustment_status" AS ENUM('PENDING_SECOND', 'APPLIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."bonus_period_status" AS ENUM('OPEN', 'CLOSING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."bonus_score_status" AS ENUM('PRELIMINARY', 'PENDING', 'MANUAL_REVIEW', 'APPEALED', 'CONFIRMED', 'NOT_EVALUATED');--> statement-breakpoint
CREATE TABLE "bonus_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_id" uuid NOT NULL,
	"criterion" text NOT NULL,
	"delta" integer NOT NULL,
	"reason_code" text NOT NULL,
	"comment" text NOT NULL,
	"author_id" text,
	"status" "adjustment_status" DEFAULT 'APPLIED' NOT NULL,
	"second_approver_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_criteria_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_id" uuid NOT NULL,
	"criterion" text NOT NULL,
	"section" text NOT NULL,
	"max_points" integer NOT NULL,
	"earned_points" integer NOT NULL,
	"status" text NOT NULL,
	"basis" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_period_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shifts" integer NOT NULL,
	"evaluated_shifts" integer NOT NULL,
	"pending_shifts" integer NOT NULL,
	"s_month" numeric(6, 2),
	"weight_sum" numeric(8, 3) NOT NULL,
	"base_amount" numeric(12, 2),
	"bonus_amount" numeric(12, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" "bonus_period_status" DEFAULT 'OPEN' NOT NULL,
	"rule_version_id" uuid,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"label" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"rules" jsonb NOT NULL,
	"created_by" text,
	"approved_by" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_shift_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_session_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"business_date" text NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"status" "bonus_score_status" DEFAULT 'PRELIMINARY' NOT NULL,
	"score" integer,
	"applicable_max" integer NOT NULL,
	"earned" integer NOT NULL,
	"planned_minutes" integer DEFAULT 720 NOT NULL,
	"inputs_hash" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"excluded_reason" text
);
--> statement-breakpoint
ALTER TABLE "bonus_adjustments" ADD CONSTRAINT "bonus_adjustments_score_id_bonus_shift_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."bonus_shift_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_criteria_results" ADD CONSTRAINT "bonus_criteria_results_score_id_bonus_shift_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."bonus_shift_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_period_results" ADD CONSTRAINT "bonus_period_results_period_id_bonus_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."bonus_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_period_results" ADD CONSTRAINT "bonus_period_results_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_periods" ADD CONSTRAINT "bonus_periods_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_periods" ADD CONSTRAINT "bonus_periods_rule_version_id_bonus_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."bonus_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_rule_versions" ADD CONSTRAINT "bonus_rule_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD CONSTRAINT "bonus_shift_scores_shift_session_id_shift_sessions_id_fk" FOREIGN KEY ("shift_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD CONSTRAINT "bonus_shift_scores_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD CONSTRAINT "bonus_shift_scores_rule_version_id_bonus_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."bonus_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonus_adjustments_score_idx" ON "bonus_adjustments" USING btree ("score_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_criteria_results_uq" ON "bonus_criteria_results" USING btree ("score_id","criterion");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_period_results_uq" ON "bonus_period_results" USING btree ("period_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_periods_site_month_uq" ON "bonus_periods" USING btree ("site_id","month");--> statement-breakpoint
CREATE INDEX "bonus_rule_versions_site_valid_idx" ON "bonus_rule_versions" USING btree ("site_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_shift_scores_session_uq" ON "bonus_shift_scores" USING btree ("shift_session_id");--> statement-breakpoint
CREATE INDEX "bonus_shift_scores_employee_date_idx" ON "bonus_shift_scores" USING btree ("employee_id","business_date");