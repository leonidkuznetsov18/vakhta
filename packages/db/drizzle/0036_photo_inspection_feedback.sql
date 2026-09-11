CREATE TABLE "photo_inspection_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_inspection_feedback_rating_valid" CHECK ("photo_inspection_feedback"."rating" IN ('HELPFUL', 'PARTIAL', 'NOT_HELPFUL')),
	CONSTRAINT "photo_inspection_feedback_comment_valid" CHECK ("photo_inspection_feedback"."comment" IS NULL OR length("photo_inspection_feedback"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "photo_inspection_feedback" ADD CONSTRAINT "photo_inspection_feedback_run_id_photo_inspection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."photo_inspection_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_inspection_feedback_run_actor_uq" ON "photo_inspection_feedback" USING btree ("run_id","actor_id");