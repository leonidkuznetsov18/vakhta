CREATE TABLE "assignment_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"local_start" text NOT NULL,
	"local_end" text NOT NULL,
	"relief_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_breaks_position_nonnegative" CHECK ("assignment_breaks"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assignment_breaks" ADD CONSTRAINT "assignment_breaks_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_breaks" ADD CONSTRAINT "assignment_breaks_relief_employee_id_employees_id_fk" FOREIGN KEY ("relief_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_breaks_position_uq" ON "assignment_breaks" USING btree ("assignment_id","position");