CREATE TYPE "public"."wellbeing_answer" AS ENUM('GOOD', 'SAME', 'WORSE');--> statement-breakpoint
CREATE TABLE "wellbeing_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"answer" "wellbeing_answer" NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "background_tasks" DROP CONSTRAINT "background_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "wellbeing_checkins" ADD CONSTRAINT "wellbeing_checkins_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellbeing_checkins" ADD CONSTRAINT "wellbeing_checkins_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wellbeing_checkins_request_date_uq" ON "wellbeing_checkins" USING btree ("request_id","business_date");--> statement-breakpoint
ALTER TABLE "background_tasks" ADD CONSTRAINT "background_tasks_kind_valid" CHECK ("background_tasks"."kind" IN ('PHOTO_INSPECT', 'MEDIA_PROCESS', 'SHIFT_REMINDER', 'ACK_REMINDER', 'RETURN_REMINDER', 'DOWNTIME_ESCALATION', 'INCIDENT_SLA', 'HANDOVER_TIMEOUT', 'CLEANING_REMINDER', 'BONUS_RECALCULATE', 'BIRTHDAY_GREETING', 'ABSENCE_CHECKIN', 'ABSENCE_RETURN'));