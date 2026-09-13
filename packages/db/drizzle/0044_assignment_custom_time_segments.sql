CREATE TABLE "assignment_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"zone_id" uuid NOT NULL,
	"local_start" text NOT NULL,
	"local_end" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_segments_position_nonnegative" CHECK ("assignment_segments"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "custom_start" text;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "custom_end" text;--> statement-breakpoint
ALTER TABLE "assignment_segments" ADD CONSTRAINT "assignment_segments_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_segments" ADD CONSTRAINT "assignment_segments_zone_id_responsibility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."responsibility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_segments_position_uq" ON "assignment_segments" USING btree ("assignment_id","position");