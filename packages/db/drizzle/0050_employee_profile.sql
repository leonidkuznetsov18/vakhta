CREATE TYPE "public"."marital_status" AS ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');--> statement-breakpoint
CREATE TABLE "employee_compensation_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"employment_rate" numeric NOT NULL,
	"hourly_rate" numeric,
	"monthly_salary" numeric,
	"currency" text DEFAULT 'UAH' NOT NULL,
	"corrects_entry_id" uuid,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_rate_range" CHECK ("employee_compensation_entries"."employment_rate" > 0 AND "employee_compensation_entries"."employment_rate" <= 1),
	CONSTRAINT "compensation_amounts" CHECK (("employee_compensation_entries"."hourly_rate" IS NULL OR "employee_compensation_entries"."hourly_rate" >= 0) AND ("employee_compensation_entries"."monthly_salary" IS NULL OR "employee_compensation_entries"."monthly_salary" >= 0)),
	CONSTRAINT "compensation_precision" CHECK (scale("employee_compensation_entries"."employment_rate") <= 2 AND ("employee_compensation_entries"."hourly_rate" IS NULL OR scale("employee_compensation_entries"."hourly_rate") <= 2 AND "employee_compensation_entries"."hourly_rate" < 10000000000) AND ("employee_compensation_entries"."monthly_salary" IS NULL OR scale("employee_compensation_entries"."monthly_salary") <= 2 AND "employee_compensation_entries"."monthly_salary" < 10000000000)),
	CONSTRAINT "compensation_amount_required" CHECK ("employee_compensation_entries"."hourly_rate" IS NOT NULL OR "employee_compensation_entries"."monthly_salary" IS NOT NULL),
	CONSTRAINT "compensation_currency" CHECK ("employee_compensation_entries"."currency" = 'UAH'),
	CONSTRAINT "compensation_correction_reason" CHECK ("employee_compensation_entries"."corrects_entry_id" IS NULL OR length(trim("employee_compensation_entries"."reason")) >= 3 AND "employee_compensation_entries"."reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN "master_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN "master_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN "master_assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "marital_status" "marital_status";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "avatar_media_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_compensation_entries" ADD CONSTRAINT "employee_compensation_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_compensation_entries" ADD CONSTRAINT "employee_compensation_entries_corrects_entry_id_employee_compensation_entries_id_fk" FOREIGN KEY ("corrects_entry_id") REFERENCES "public"."employee_compensation_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compensation_original_date_uq" ON "employee_compensation_entries" USING btree ("employee_id","effective_from") WHERE "employee_compensation_entries"."corrects_entry_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "compensation_correction_target_uq" ON "employee_compensation_entries" USING btree ("corrects_entry_id") WHERE "employee_compensation_entries"."corrects_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "compensation_employee_date_idx" ON "employee_compensation_entries" USING btree ("employee_id","effective_from","created_at");--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_master_employee_id_employees_id_fk" FOREIGN KEY ("master_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_avatar_media_id_media_objects_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION enforce_employee_compensation_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target employee_compensation_entries;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Compensation history is append-only' USING ERRCODE = '23514';
  END IF;
  IF NEW.corrects_entry_id IS NOT NULL THEN
    SELECT * INTO target FROM employee_compensation_entries WHERE id = NEW.corrects_entry_id FOR SHARE;
    IF NOT FOUND OR target.employee_id <> NEW.employee_id OR target.effective_from <> NEW.effective_from THEN
      RAISE EXCEPTION 'Correction must reference the same employee and effective date' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER employee_compensation_history_guard BEFORE INSERT OR UPDATE OR DELETE
ON employee_compensation_entries FOR EACH ROW EXECUTE FUNCTION enforce_employee_compensation_history();
