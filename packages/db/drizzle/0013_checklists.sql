-- Checklists become admin-managed templates per position and zone type (spec 5.6, FR-CLN-03),
-- and photos are attached to PHOTO items of the checklist instead of three fixed angles.
ALTER TABLE "checklist_definitions" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_definitions" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "checklist_definitions_family_idx" ON "checklist_definitions" USING btree ("family_id","version");--> statement-breakpoint
-- Definitions written before photo items existed get the three angles of FR-PHO-01 appended, so
-- a draft opened on them still demands photos.
UPDATE "checklist_definitions"
SET "items" = "items" || '[{"key":"PHOTO_OVERVIEW","label":"Общий вид зоны","kind":"PHOTO"},{"key":"PHOTO_SURFACES","label":"Рабочие поверхности","kind":"PHOTO"},{"key":"PHOTO_FLOOR","label":"Пол и пространство вокруг","kind":"PHOTO"}]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements("items") AS e WHERE e->>'kind' = 'PHOTO'
);--> statement-breakpoint
UPDATE "checklist_definitions" SET "name" = 'Уборка и передача зоны' WHERE "name" = '';--> statement-breakpoint
ALTER TABLE "handover_media" ADD COLUMN "item_key" text;--> statement-breakpoint
UPDATE "handover_media" SET "item_key" = 'PHOTO_' || "angle"::text;--> statement-breakpoint
ALTER TABLE "handover_media" ALTER COLUMN "item_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX "handover_media_angle_uq";--> statement-breakpoint
ALTER TABLE "handover_media" DROP COLUMN "angle";--> statement-breakpoint
CREATE UNIQUE INDEX "handover_media_item_uq" ON "handover_media" USING btree ("handover_id","item_key");--> statement-breakpoint
DROP TYPE "public"."handover_angle";
