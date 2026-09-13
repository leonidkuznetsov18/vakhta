CREATE TYPE "public"."availability_kind" AS ENUM('UNAVAILABLE', 'PREFERRED');--> statement-breakpoint
CREATE TYPE "public"."eligibility_severity" AS ENUM('BLOCK', 'WARN');--> statement-breakpoint
CREATE TABLE "employee_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "availability_kind" NOT NULL,
	"weekday" integer,
	"date" date,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"note" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_availability_target" CHECK (("employee_availability"."weekday" IS NULL) <> ("employee_availability"."date" IS NULL) AND ("employee_availability"."weekday" IS NULL OR "employee_availability"."weekday" BETWEEN 0 AND 6)),
	CONSTRAINT "employee_availability_window" CHECK ("employee_availability"."valid_to" IS NULL OR "employee_availability"."valid_to" >= "employee_availability"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "site_scheduling_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"min_rest_minutes" integer DEFAULT 660 NOT NULL,
	"max_month_minutes" integer DEFAULT 12000 NOT NULL,
	"rest_severity" "eligibility_severity" DEFAULT 'WARN' NOT NULL,
	"hours_severity" "eligibility_severity" DEFAULT 'WARN' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_scheduling_rules_rest_nonnegative" CHECK ("site_scheduling_rules"."min_rest_minutes" >= 0),
	CONSTRAINT "site_scheduling_rules_hours_positive" CHECK ("site_scheduling_rules"."max_month_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_scheduling_rules" ADD CONSTRAINT "site_scheduling_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_availability_employee_idx" ON "employee_availability" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_scheduling_rules_site_uq" ON "site_scheduling_rules" USING btree ("site_id");