ALTER TYPE "public"."adjustment_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "bonus_adjustments" ALTER COLUMN "criterion" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD COLUMN "manual_score" integer;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bonus_shift_scores" ADD COLUMN "review_comment" text;