CREATE TYPE "public"."point_award_kind" AS ENUM('CHECKLIST_APPROVED', 'UNIT_OF_MONTH', 'MASTER_OF_MONTH');--> statement-breakpoint
CREATE TABLE "bonus_point_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"month" text NOT NULL,
	"business_date" date,
	"kind" "point_award_kind" NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"handover_id" uuid,
	"note" text,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bonus_point_awards" ADD CONSTRAINT "bonus_point_awards_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_point_awards" ADD CONSTRAINT "bonus_point_awards_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_point_awards" ADD CONSTRAINT "bonus_point_awards_handover_id_handover_records_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonus_point_awards_month_idx" ON "bonus_point_awards" USING btree ("month");--> statement-breakpoint
CREATE INDEX "bonus_point_awards_employee_month_idx" ON "bonus_point_awards" USING btree ("employee_id","month");--> statement-breakpoint
CREATE INDEX "bonus_point_awards_unit_month_idx" ON "bonus_point_awards" USING btree ("org_unit_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_point_awards_handover_uq" ON "bonus_point_awards" USING btree ("handover_id");
--> statement-breakpoint
-- Backfill: every checklist already approved earns its point, dated by the shift's business date
-- and attributed to the employee's unit at the time of the shift.
INSERT INTO "bonus_point_awards" ("employee_id", "org_unit_id", "month", "business_date", "kind", "points", "handover_id", "note")
SELECT
  h."submitted_by",
  a."org_unit_id",
  to_char(s."business_date", 'YYYY-MM'),
  s."business_date",
  'CHECKLIST_APPROVED',
  1,
  h."id",
  'backfill'
FROM "handover_records" h
JOIN "shift_sessions" s ON s."id" = h."shift_session_id"
LEFT JOIN "shift_assignments" a ON a."id" = s."assignment_id"
WHERE h."status" IN ('ACCEPTED', 'RESOLVED_ACCEPTED')
ON CONFLICT ("handover_id") DO NOTHING;

-- Month-end awards are handed out once per employee, month and kind: the unit of the month and its
-- shift master. Checklist points are excluded, they are already unique per handover.
CREATE UNIQUE INDEX "bonus_point_awards_month_kind_uq" ON "bonus_point_awards" USING btree ("employee_id","month","kind") WHERE "bonus_point_awards"."kind" <> 'CHECKLIST_APPROVED';
