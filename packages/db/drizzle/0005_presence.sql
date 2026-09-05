CREATE TYPE "public"."check_action" AS ENUM('ARRIVE', 'DEPART');--> statement-breakpoint
CREATE TYPE "public"."presence_method" AS ENUM('QR', 'TERMINAL', 'MASTER', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."presence_status" AS ENUM('OPEN', 'CLOSED', 'NEEDS_CLARIFICATION');--> statement-breakpoint
CREATE TABLE "presence_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"assignment_id" uuid,
	"arrived_at" timestamp with time zone NOT NULL,
	"departed_at" timestamp with time zone,
	"arrival_method" "presence_method" NOT NULL,
	"departure_method" "presence_method",
	"arrival_terminal_id" uuid,
	"departure_terminal_id" uuid,
	"confirmed_by" uuid,
	"reason_code" text,
	"status" "presence_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_challenge_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"assignment_id" uuid,
	"action" "check_action" NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD CONSTRAINT "presence_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD CONSTRAINT "presence_sessions_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD CONSTRAINT "presence_sessions_arrival_terminal_id_qr_terminals_id_fk" FOREIGN KEY ("arrival_terminal_id") REFERENCES "public"."qr_terminals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD CONSTRAINT "presence_sessions_departure_terminal_id_qr_terminals_id_fk" FOREIGN KEY ("departure_terminal_id") REFERENCES "public"."qr_terminals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_challenge_uses" ADD CONSTRAINT "qr_challenge_uses_challenge_id_qr_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."qr_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_challenge_uses" ADD CONSTRAINT "qr_challenge_uses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_challenge_uses" ADD CONSTRAINT "qr_challenge_uses_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presence_sessions_open_uq" ON "presence_sessions" USING btree ("employee_id") WHERE "presence_sessions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "presence_sessions_employee_arrived_idx" ON "presence_sessions" USING btree ("employee_id","arrived_at");--> statement-breakpoint
CREATE INDEX "presence_sessions_assignment_idx" ON "presence_sessions" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_challenge_uses_once_uq" ON "qr_challenge_uses" USING btree ("employee_id","assignment_id","action") WHERE "qr_challenge_uses"."assignment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "qr_challenge_uses_challenge_idx" ON "qr_challenge_uses" USING btree ("challenge_id");