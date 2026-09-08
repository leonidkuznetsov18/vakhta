ALTER TABLE "shift_sessions" ADD COLUMN "plan_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD COLUMN "plan_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD COLUMN "auto_close_reason" text;