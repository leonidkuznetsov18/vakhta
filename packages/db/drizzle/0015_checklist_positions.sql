CREATE TABLE "checklist_definition_positions" (
	"definition_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	CONSTRAINT "checklist_definition_positions_definition_id_position_id_pk" PRIMARY KEY("definition_id","position_id")
);
--> statement-breakpoint
ALTER TABLE "checklist_definitions" DROP CONSTRAINT "checklist_definitions_position_id_positions_id_fk";
--> statement-breakpoint
DROP INDEX "checklist_definitions_active_idx";--> statement-breakpoint
ALTER TABLE "checklist_definition_positions" ADD CONSTRAINT "checklist_definition_positions_definition_id_checklist_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."checklist_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_definition_positions" ADD CONSTRAINT "checklist_definition_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_definition_positions_position_idx" ON "checklist_definition_positions" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "checklist_definitions_active_idx" ON "checklist_definitions" USING btree ("is_active","zone_type");--> statement-breakpoint
-- A checklist keeps the position it was bound to; from now on it may serve several positions.
INSERT INTO "checklist_definition_positions" ("definition_id", "position_id")
SELECT "id", "position_id" FROM "checklist_definitions" WHERE "position_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "checklist_definitions" DROP COLUMN "position_id";