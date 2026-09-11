-- One object list per checklist family: the lists of its zones merge into one row.
CREATE TEMP TABLE photo_rules_keeper AS
SELECT DISTINCT ON (family_id) id AS keeper_id, family_id
FROM checklist_photo_rules
ORDER BY family_id, jsonb_array_length(rules) DESC, updated_at DESC;--> statement-breakpoint
UPDATE checklist_photo_rules k SET rules = (
  SELECT COALESCE(jsonb_agg(rule), '[]'::jsonb) FROM (
    SELECT DISTINCT ON (rule->>'objectId') rule
    FROM checklist_photo_rules r, jsonb_array_elements(r.rules) rule
    WHERE r.family_id = k.family_id
    ORDER BY rule->>'objectId', length(rule->>'note') DESC
  ) merged
), version = version + 1, updated_at = now()
FROM photo_rules_keeper pk
WHERE pk.keeper_id = k.id AND EXISTS (
  SELECT 1 FROM checklist_photo_rules other WHERE other.family_id = k.family_id AND other.id <> k.id
);--> statement-breakpoint
DELETE FROM checklist_photo_rules WHERE id NOT IN (SELECT keeper_id FROM photo_rules_keeper);--> statement-breakpoint
DROP TABLE photo_rules_keeper;--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP CONSTRAINT "checklist_photo_rules_zone_id_responsibility_zones_id_fk";
--> statement-breakpoint
DROP INDEX "checklist_photo_rules_family_zone_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_photo_rules_family_uq" ON "checklist_photo_rules" USING btree ("family_id");--> statement-breakpoint
ALTER TABLE "checklist_photo_rules" DROP COLUMN "zone_id";