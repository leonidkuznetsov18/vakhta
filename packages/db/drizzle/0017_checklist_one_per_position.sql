-- A position has one checklist (ADR-0012): keep the binding to the newest active definition,
-- drop the rest, then make the position unique.
DELETE FROM "checklist_definition_positions" b
USING (
  SELECT
    b2."position_id",
    b2."definition_id",
    ROW_NUMBER() OVER (
      PARTITION BY b2."position_id"
      ORDER BY d."is_active" DESC, d."version" DESC, d."created_at" DESC
    ) AS rn
  FROM "checklist_definition_positions" b2
  JOIN "checklist_definitions" d ON d."id" = b2."definition_id"
) ranked
WHERE ranked."position_id" = b."position_id"
  AND ranked."definition_id" = b."definition_id"
  AND ranked.rn > 1;--> statement-breakpoint
DROP INDEX "checklist_definition_positions_position_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_definition_positions_position_uq" ON "checklist_definition_positions" USING btree ("position_id");--> statement-breakpoint
-- An active checklist always has a position: legacy rows without one are disabled.
UPDATE "checklist_definitions" d SET "is_active" = false
WHERE d."is_active" AND NOT EXISTS (
  SELECT 1 FROM "checklist_definition_positions" b WHERE b."definition_id" = d."id"
);
