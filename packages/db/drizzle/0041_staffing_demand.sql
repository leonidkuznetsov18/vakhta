CREATE TABLE "employee_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"qualification_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"note" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_qualifications_valid_window" CHECK ("employee_qualifications"."valid_until" IS NULL OR "employee_qualifications"."valid_until" >= "employee_qualifications"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_staffing_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"required_count" integer NOT NULL,
	"qualification_id" uuid,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_staffing_requirements_count_positive" CHECK ("zone_staffing_requirements"."required_count" > 0),
	CONSTRAINT "zone_staffing_requirements_window" CHECK ("zone_staffing_requirements"."effective_to" IS NULL OR "zone_staffing_requirements"."effective_to" >= "zone_staffing_requirements"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_staffing_requirements" ADD CONSTRAINT "zone_staffing_requirements_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_staffing_requirements" ADD CONSTRAINT "zone_staffing_requirements_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_staffing_requirements" ADD CONSTRAINT "zone_staffing_requirements_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_qualifications_employee_idx" ON "employee_qualifications" USING btree ("employee_id","qualification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualifications_site_code_uq" ON "qualifications" USING btree ("site_id","code");--> statement-breakpoint
CREATE INDEX "zone_staffing_requirements_zone_idx" ON "zone_staffing_requirements" USING btree ("zone_id","template_id");